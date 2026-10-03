---
tags: [negative]
runs: 2
max_turns: 10
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
---

Add a concise docstring to this Python function:

```python
def retry(fn, attempts=3, delay=0.5):
    for i in range(attempts):
        try:
            return fn()
        except Exception:
            if i == attempts - 1:
                raise
            time.sleep(delay * 2 ** i)
```
