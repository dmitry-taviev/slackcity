FROM node:alpine

COPY . /usr/src/app
WORKDIR /usr/src/app
RUN yarn install && yarn build

CMD ["node", "dist/index.js"]