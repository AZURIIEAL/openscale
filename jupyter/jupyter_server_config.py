# Allows the OpenScale frontend (a different origin) to embed this server
# in an <iframe>. Jupyter Server's default clickjacking protection
# (X-Frame-Options / frame-ancestors 'self') blocks cross-origin iframing
# otherwise -- this is the actual mechanism that makes the Notebooks
# screen's embed work, not anything on the Vite/frontend side.
c.ServerApp.tornado_settings = {
    "headers": {
        "Content-Security-Policy": "frame-ancestors 'self' http://localhost:5173",
    }
}

# The XSRF cookie check also trips on a cross-origin embed. Accepted here
# for the same reason auth is skipped platform-wide for v1: a local,
# single-user dev tool.
c.ServerApp.disable_check_xsrf = True
