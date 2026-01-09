FROM eclipse-temurin:25-jdk-alpine

RUN apk add --no-cache \
    bash \
    coreutils \
    nodejs \
    npm

WORKDIR /app

COPY scripts/ ./scripts/
COPY web/ ./web/
COPY start.sh ./

RUN chmod +x start.sh

EXPOSE 8080

CMD ["./start.sh"]
