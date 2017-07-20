FROM node:alpine

COPY . /usr/src/app
WORKDIR /usr/src/app
RUN yarn install

CMD ["node", "index.js"]