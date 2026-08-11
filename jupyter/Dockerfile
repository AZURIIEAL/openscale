FROM jupyter/scipy-notebook:latest
COPY jupyter_server_config.py /home/jovyan/.jupyter/jupyter_server_config.py
RUN pip install --no-cache-dir pandas==2.3.3 pyarrow
