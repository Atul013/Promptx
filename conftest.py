"""Root conftest: makes the repo root importable as a namespace for `py.py`.

`py.py` lives at the repo root (not inside a package), so tests import it via
importlib using its file path rather than `import py` — `py` is also the name
of a real PyPI package that pytest's own internals rely on, and we do not
want a plain `sys.path` insertion to shadow it for the whole test session.
"""
import importlib.util
import os
import sys

REPO_ROOT = os.path.dirname(os.path.abspath(__file__))


def _load_py_module():
    module_name = "promptx_rules_engine"
    if module_name in sys.modules:
        return sys.modules[module_name]

    # Ensure no API key (from a real environment or a repo .env file) causes
    # py.py to configure a live Gemini client at import time. Tests must run
    # fully offline regardless of the developer's local environment.
    old_key = os.environ.pop("GEMINI_API_KEY", None)
    old_cwd = os.getcwd()
    try:
        # py.py falls back to reading a local .env file when the env var is
        # absent; run the import from a directory with no .env so that path
        # is not taken either.
        os.chdir(REPO_ROOT)
        env_path = os.path.join(REPO_ROOT, ".env")
        env_tmp_path = os.path.join(REPO_ROOT, ".env.pytest-tmp")
        had_env_file = os.path.exists(env_path)
        if had_env_file:
            os.rename(env_path, env_tmp_path)
        try:
            spec = importlib.util.spec_from_file_location(
                module_name, os.path.join(REPO_ROOT, "py.py")
            )
            module = importlib.util.module_from_spec(spec)
            sys.modules[module_name] = module
            spec.loader.exec_module(module)
        finally:
            if had_env_file:
                os.rename(env_tmp_path, env_path)
    finally:
        os.chdir(old_cwd)
        if old_key is not None:
            os.environ["GEMINI_API_KEY"] = old_key

    return module


# Load once at collection time and expose it under a stable name tests can
# import via `from conftest import rules_engine`, or re-import through
# sys.modules["promptx_rules_engine"].
rules_engine = _load_py_module()
