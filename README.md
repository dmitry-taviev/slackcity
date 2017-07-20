# SlackCity - build notifications without plugins #
## Quickstart ##
```
docker run \
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

Next, set proper environment variable values in your compose file:
```
environment:
      TC_HOST: your.tc.host
      TC_PROJECT: ProjectName
      TC_USER: teamcity-username
      TC_PASSWORD: teamcity-password
      SLACK_TOKEN: slack-oauth-access-token
      SLACK_CHANNEL: "#yourchannel"
```

Finally, run SlackCity and enjoy!

`docker-compose up`
