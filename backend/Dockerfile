# syntax=docker/dockerfile:1
FROM eclipse-temurin:25-jdk AS build
WORKDIR /src
COPY . .
# Tests run in CI. This stage only packages the application.
RUN --mount=type=cache,target=/root/.m2 sh mvnw -B -ntp -DskipTests package

FROM eclipse-temurin:25-jre
RUN useradd --system --no-create-home securevault
WORKDIR /app
COPY --from=build /src/target/securevault-backend-*.jar app.jar
USER securevault
EXPOSE 8080
# Uses bash's built-in TCP support, so the image needs no extra HTTP client.
HEALTHCHECK --interval=10s --timeout=5s --start-period=60s --retries=6 \
  CMD ["bash", "-c", "exec 3<>/dev/tcp/127.0.0.1/8080 && printf 'GET /actuator/health/readiness HTTP/1.0\\r\\n\\r\\n' >&3 && grep -q '\"status\":\"UP\"' <&3"]
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-jar", "/app/app.jar"]
