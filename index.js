
const TeamcityClient = require("teamcity-client");
const SlackClient = require("@slack/client").WebClient;
const prettyMs = require("pretty-ms");
const filesize = require("filesize");

const lastFinishedBuilds = async (client, whitelist) => {
    const project = await client.project.detail({
        id: process.env.TC_PROJECT
    });
    const lastBuilds = {};
    if (project.buildTypes.count) {
        project.buildTypes.buildType
            .filter(buidType => !whitelist.length || whitelist.includes(buidType.id))
            .forEach((buildType) => {
                lastBuilds[buildType.id] = 0;
            });
    }
    await Promise.all(
        Object.keys(lastBuilds).map(async (buildTypeID) => {
            const {id} = await lastBuild(client, buildTypeID);
            if (typeof id !== "undefined") {
                lastBuilds[buildTypeID] = id;
            }
        })
    );
    return lastBuilds;
};

const lastBuild = async (client, typeID) => {
    const {build} = await client.build.list({
        project: process.env.TC_PROJECT,
        state: "finished",
        lookupLimit: 1,
        buildType: typeID
    });
    if (typeof build === "undefined") {
        return null;
    }
    return build[0];
};

const listBuilds = async (client, beginWithID, whitelist) => {
    const {build: unsorted} = await client.build.list({
        project: process.env.TC_PROJECT,
        state: 'finished',
        lookupLimit: 10,
    });
    if (typeof unsorted === "undefined") {
        return [];
    }
    return unsorted
        .sort((build1, build2) => build2.id - build1.id)
        .filter(build => build.id > beginWithID)
        .filter(build => !whitelist.length || whitelist.includes(build.buildTypeId));
};

const slackSend = async (slack, tc, id, channel) => {
    const build = await detailsOfBuild(tc, id);
    const fields = [
        {
            title: "Duration",
            value: await durationOfBuild(tc, build.id),
            short: true
        },
        {
            title: "Agent",
            value: await agent(tc, build),
            short: true
        },
        {
            title: "Status",
            value: build.statusText,
            short: true
        },
        {
            title: "Download",
            value: await releaseLink(tc, build),
            short: true
        }
    ];
    if (
        !process.env.OMIT_TESTS_IF_PASSED ||
        (process.env.OMIT_TESTS_IF_PASSED && build.status !== "SUCCESS")
    ) {
        const tests = await testStatus(tc, build);
        fields.push({
            title: "Tests",
            value: tests.split("\n").slice(0, 4).join("\n")
        });
    }
    const changes = await commits(tc, build);
    if (
        !process.env.OMIT_COMMITS_IF_NONE ||
        (process.env.OMIT_COMMITS_IF_NONE && changes !== "Nothing changed")
    ) {
        fields.push({
            title: "Commits",
            value: changes
        });
    }
    return await slack.chat.postMessage(channel, null, {
        attachments: [{
            pretext: pretext(build),
            color: color(build),
            title: title(build),
            title_link: build.webUrl,
            fields,
            mrkdwn_in: ["pretext", "fields"]
        }],
    });
};

const agent = async (client, build) => {
    let emoji = ":linux:";
    try {
        const agent = await client.httpClient.readJSON(`agents/id:${build.agent.id}`);
        let {value: os} = agent.properties.property
            .find(property => property.name === "teamcity.agent.jvm.os.name");
        os = os.toLowerCase();
        if (os.indexOf("mac") > -1) {
            emoji = ":osx:";
        } else if (os.indexOf("win") > -1) {
            emoji = ":windows:"
        }
    } catch (err) {
        console.log("AGENT ERROR:", err);
    }
    return `${emoji} ${build.agent.name}`;
};

const releaseLink = async (client, build) => {
    const placeholder = "Release not available";
    if (!process.env.RELEASE_ARTIFACT) {
        return placeholder;
    }
    const {file: files} = await client.artifact.children({id: build.id}, "");
    const release = files.find(file => file.name === process.env.RELEASE_ARTIFACT);
    if (!release) {
        return placeholder;
    }
    return link(
        `https://${process.env.TC_HOST}/repository/download/${build.buildTypeId}/${build.id}:id/${release.name}`,
        `${release.name} (${filesize(release.size)})`
    );
};

const durationOfBuild = async (client, id) => {
    const stats = await client.httpClient.readJSON(`builds/id:${id}/statistics`);
    return prettyMs(parseInt(stats.property.find(property => property.name === "BuildDuration").value));
};

const detailsOfBuild = async (client, id) => await client.build.detail({id});

const listTests = async (client, build) => await client.httpClient.readJSON(`testOccurrences?locator=build:${build.id}`);

const detailsOfTest = async (client, id) => await client.httpClient.readJSON(`testOccurrences/${id}`);

const testEmoji = test => test.ignored ? ":okay:" : ":goberserk:";

const formatTestName = name => name.slice(process.env.TEST_PACKAGE ? process.env.TEST_PACKAGE.length + 1 : 0);

const failedTestLink = (build, test) => {
    const testLink = link(
        `${build.webUrl}&tab=buildResultsDiv#testNameId${test.test.id}`,
        `${testEmoji(test)} \`${formatTestName(test.name)}\``
    );
    if (test.status !== "FAILURE" || !process.env.TEST_REPORT_ARTIFACT) {
        return testLink;
    }
    const expr = new RegExp('Screenshot: file:(?:.+)\/tests\/(.+)\.png');
    const match = expr.exec(test.details);
    if (match !== null && typeof match[1] !== "undefined") {
        const screenshot = `${process.env.TEST_REPORT_ARTIFACT}%21/tests/${match[1]}.png`;
        const screenshotLink = link(
            `https://${process.env.TC_HOST}/repository/download/${build.buildTypeId}/${build.id}:id/${screenshot}`,
            ":frame_with_picture:"
        );
        return `${testLink} ${screenshotLink}`;
    }
    return `${testLink}`;
};

const testStatus = async (client, build) => {
    let testStatus = ":rollsafe: There were no tests";
    if (typeof build.testOccurrences === "undefined" || !build.testOccurrences.count) {
        return testStatus;
    }
    try {
        const {testOccurrence: tests} = await listTests(client, build);
        const failing = tests
            .filter(test => test.status !== "SUCCESS")
            .filter(test => process.env.DISPLAY_IGNORED_TESTS !== "false" || test.status !== "UNKNOWN");
        if (!failing.length) {
            testStatus = `:awesome: All ${tests.length} tests passed!`;
        } else {
            testStatus = (await Promise.all(
                failing.map(async test => failedTestLink(
                        build,
                        await detailsOfTest(client, test.id)
                    ))
            )).join("\n");
        }
    } catch (err) {
        console.log("ERROR:", err);
    }
    return testStatus;
};

const pretext = build => `*${build.buildType.projectName}* build results:`;

const color = build => build.status === "SUCCESS" ? "good" : "danger";

const title = build => `Build "${build.buildType.name}" #${build.number} ${build.status === "SUCCESS" ? "SUCCEEDED" : "FAILED"}`;

const link = (href, text) => `<${href}|${text}>`;

const commitLink = (revision, version) => link(
        `https://github.com/${revision["vcs-root-instance"].name}/commit/${version}`,
        `\`${version.substring(0, 8)}\``
    );

const commitMessage = async (client, changeId) => {
    const {comment} = await client.changes.detail(changeId);
    return comment.split("\n")[0];
};

const commits = async (client, build) => {
    const placeholder = "Nothing changed";
    let revision = null;
    if (
        typeof build.revisions.revision === "undefined" &&
        build["snapshot-dependencies"].count
    ) {
        try {
            const snapshot = await detailsOfBuild(client, build["snapshot-dependencies"].build[0].id);
            revision = snapshot.revisions.revision[0];
            build.lastChanges = snapshot.lastChanges;
        } catch (err) {
            return placeholder;
        }
    } else {
        revision = build.revisions.revision[0];
    }
    if (typeof build.lastChanges === "undefined") {
        return placeholder;
    }
    const commits = await Promise.all(
        build.lastChanges.change
            .map(async (change) => {
                const link = commitLink(revision, change.version);
                const message = await commitMessage(client, change.id);
                return `${link} ${message} - _${change.username}_`;
            })
    );
    return commits.join("\n");
};

const main = async () => {
    console.log("INITIALIZING..");

    const tc = new TeamcityClient({
        protocol: "https://",
        host: process.env.TC_HOST,
        user: process.env.TC_USER,
        password: process.env.TC_PASSWORD
    });
    const slack = new SlackClient(process.env.SLACK_TOKEN);
    const channel = process.env.SLACK_CHANNEL;
    const timeout = 10000;

    let whitelist = [];
    if (process.env.BUILD_WHITELIST) {
        whitelist = process.env.BUILD_WHITELIST
            .split(",")
            .map(type => `${process.env.TC_PROJECT}_${type}`);
    }

    let running = false;

    const sentBuilds = [];

    const loop = async () => {
        if (running) {
            return;
        }
        running = true;
        try {
            //force finished builds check to catch slower builds
            const lastBuilds = await lastFinishedBuilds(tc, whitelist);
            console.log("initial state:", lastBuilds);
            const lastIDs = Object.values(lastBuilds);
            if (process.env.NODE_ENV !== "development" && !sentBuilds.length) {
                lastIDs.forEach(id => sentBuilds.push(id));
            }
            let beginWithID = 0;
            if (lastIDs.length) {
                beginWithID = Math.min(...lastIDs);
            }
            console.log(`searching builds newer than ${beginWithID}`);
            const builds = await listBuilds(tc, beginWithID, whitelist);
            console.log(`found ${builds.length} builds`);
            await Promise.all(
                builds.reverse().map(async (build) => {
                    if (
                        typeof lastBuilds[build.buildTypeId] === 'undefined' ||
                        lastBuilds[build.buildTypeId] < build.id ||
                        !sentBuilds.includes(build.id)
                    ) {
                        console.log(`sending notification for ${build.buildTypeId}#${build.number} (id:${build.id})`);
                        try {
                            await slackSend(slack, tc, build.id, channel);
                            //update finished builds to avoid duplicates within same iteration
                            if (lastBuilds[build.buildTypeId] < build.id) {
                                lastBuilds[build.buildTypeId] = build.id;
                            }
                            sentBuilds.push(build.id);
                            console.log('done', lastBuilds);
                        } catch (err) {
                            console.log("SEND ERROR:", err);
                        }
                    } else {
                        console.log("SKIPPING", build.buildTypeId, build.id);
                    }
                })
            );
            running = false;
        } catch (err) {
            console.log("ERROR:", err);
            running = false;
        }
    };

    setInterval(async () => await loop(), timeout);
};

main();