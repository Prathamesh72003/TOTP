FROM node:20.15.1

WORKDIR /app

COPY . .

COPY package.json package-lock.json ./

RUN npm install --production

EXPOSE 4000

CMD ["node", "app.js"]
