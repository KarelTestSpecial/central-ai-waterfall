FROM node:22-slim
WORKDIR /app
# Installeer pnpm
RUN npm install -g pnpm
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile
COPY . .
EXPOSE 5005
CMD ["node", "server.js"]
