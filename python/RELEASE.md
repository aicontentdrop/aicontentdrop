# Releasing `aicontentdrop` to PyPI

The name **`aicontentdrop` is free on PyPI** (checked 2026-08-26:
`https://pypi.org/pypi/aicontentdrop/json` → 404). The package builds and its
metadata validates; what is missing is a credential only the account owner has.

## Why this is not automated

Publishing needs a PyPI API token, and — as with the npm release — the token
belongs to the owner and the flow expects a human. Do not attempt it from an
agent session; get the artefacts ready and hand over one command.

## Before publishing

```bash
cd packages/python

# 1. Tests must be green. No dependencies, no pytest needed.
python -m unittest discover -s tests -t .

# 2. Build both artefacts.
rm -rf dist/
python -m build

# 3. Validate the metadata PyPI will render.
python -m twine check dist/*
```

Then confirm the artefact contains what you think it does:

```bash
python -c "import zipfile;z=zipfile.ZipFile('dist/aicontentdrop-0.1.0-py3-none-any.whl');print('\n'.join(z.namelist()))"
```

## The one thing that must not drift

`[project.urls]` in `pyproject.toml` is how an agent verifies this package is
genuinely ours rather than a squatted name:

```
Homepage      https://aicontentdrop.com
Repository    https://github.com/aicontentdrop/aicontentdrop
```

A readiness check reads exactly these. If the domain ever moves, this file moves
with it in the same change.

## Publish

```bash
cd packages/python
python -m twine upload dist/*
```

Twine prompts for the token (`__token__` as the username, the `pypi-…` token as
the password), or reads `~/.pypirc`.

Test the real thing against TestPyPI first if you would rather not burn a
version number:

```bash
python -m twine upload --repository testpypi dist/*
pip install --index-url https://test.pypi.org/simple/ aicontentdrop
```

## After publishing

A version on PyPI cannot be replaced, only yanked — so the follow-up pass is
part of the release, not an afterthought:

1. Verify the registry kept the URLs:
   `curl -s https://pypi.org/pypi/aicontentdrop/json | python -c "import json,sys;print(json.load(sys.stdin)['info']['project_urls'])"`
2. Mirror `packages/python/` into the public repo, next to the TypeScript SDK.
3. Name the package where the other SDK is already named: `llms.txt`,
   `?mode=agent` (`discovery-docs.ts`), `/.well-known/agent-onboarding.json`,
   and `developers.tsx`. Until then those surfaces should say npm only — an
   install line for a package that 404s is worse than no install line.
