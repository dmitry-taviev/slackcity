# SlackCity - build notifications without plugins #
[![Docker Automated buil](https://img.shields.io/docker/automated/jrottenberg/ffmpeg.svg)](https://hub.docker.com/r/neueda/slackcity/)
[![license](https://img.shields.io/github/license/mashape/apistatus.svg)](https://github.com/neueda/slackcity/blob/master/LICENSE)
## Quickstart ##
```
docker run -d \
      -e TC_HOST=your.tc.host \
      -e TC_PROJECT=ProjectName \
      -e TC_USER=teamcity-username \
      -e TC_PASSWORD=teamcity-password \
      -e SLACK_TOKEN=slack-oauth-access-token \
      -e SLACK_CHANNEL="#yourchannel" \
      neueda/slackcity
```

## Usage ##
First, create your own docker-compose file from distribution:

`cp docker-compose.dist.yml docker-compose.yml`

Next, set proper environment variable values. Variables with "\*" are required.

|        Env var        |           Value            |
|:---------------------:|:--------------------------:|
|        TC_HOST*       |        your.tc.host        |
|      TC_PROJECT*      |         ProjectName        |
|        TC_USER*       |      teamcity-username     |
|      TC_PASSWORD*     |      teamcity-password     |
|      SLACK_TOKEN*     |  slack-oauth-access-token  |
|     SLACK_CHANNEL*    | #yourchannel               |
|    RELEASE_ARTIFACT   |    packaged-binaries.zip   |
|    BUILD_WHITELIST    |        Build1,Build2       |
| DISPLAY_IGNORED_TESTS |            false           |
|  OMIT_TESTS_IF_PASSED |            true            |
|  TEST_REPORT_ARTIFACT |      build-reports.zip     |
|      TEST_PACKAGE     | com.myproject.module.tests |
|  OMIT_COMMITS_IF_NONE |            true            |

Finally, run SlackCity and enjoy!

`docker-compose up -d`
