#SlackCity - build notifications without plugins
##Usage
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