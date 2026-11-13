FROM python:3.13-slim
WORKDIR /app
# JVM for the Gold/Features/Train stages -- they run a real local PySpark
# session (spark/common/spark_session.py). No winutils.exe/hadoop.dll shim
# needed here (that's a Windows-only workaround); a plain JRE + JAVA_HOME
# is enough inside this Linux container. python:3.13-slim's Debian base
# (trixie) only ships OpenJDK 21, not 17 -- pyspark 4.2.0 (Spark 4.x)
# supports both, so this is a safe substitution.
RUN apt-get update && apt-get install -y --no-install-recommends openjdk-21-jre-headless \
    && rm -rf /var/lib/apt/lists/*
ENV JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
ENV PATH="${JAVA_HOME}/bin:${PATH}"
# Build context is the repo root (see docker-compose.yml) so the shared
# libs/openscale package can be installed alongside the worker.
COPY worker/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY libs/openscale /app/libs/openscale
RUN pip install --no-cache-dir /app/libs/openscale
COPY worker/ .
ENTRYPOINT ["python", "main.py"]
