
# use the official Bun image
FROM oven/bun:1

WORKDIR /app

# copy package.json and bun.lockb
COPY package.json bun.lockb ./
COPY bun.lock ./

# install dependencies
RUN bun install --frozen-lockfile

# copy source code
COPY . .

# run the app
CMD ["bun", "run", "start:telegram"]
