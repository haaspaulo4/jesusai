#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Macro Engine - Safe stub for Meta-Persona automation.

This version is a safe placeholder that prevents crashes when the orchestrator
requests macro execution for file creation or simple tasks.

For real GUI automation, replace with a proper implementation using:
- Playwright / Puppeteer for browser tasks (recommended)
- pyautogui only when explicitly needed and with display
"""

import sys
import json
import os

def main():
    try:
        if len(sys.argv) < 2:
            print(json.dumps({"ok": False, "error": "No actions payload provided"}))
            sys.exit(1)

        actions_payload = sys.argv[1]
        actions = json.loads(actions_payload) if actions_payload else []

        results = []

        for i, step in enumerate(actions):
            act_type = step.get('action', 'unknown')

            if act_type == 'log':
                msg = step.get('message', '')
                print(f"[Macro] {msg}")
                results.append({"step": i, "action": "log", "ok": True})

            elif act_type in ['write_file', 'create_file']:
                # Safe file creation (used by Meta when user asks for landingpage etc.)
                path = step.get('path') or step.get('file')
                content = step.get('content', '')
                if path:
                    os.makedirs(os.path.dirname(path) or '.', exist_ok=True)
                    with open(path, 'w', encoding='utf-8') as f:
                        f.write(content)
                    results.append({"step": i, "action": "write_file", "path": path, "ok": True})
                else:
                    results.append({"step": i, "action": act_type, "ok": False, "error": "Missing path"})

            else:
                # Default: just acknowledge (safe mode)
                results.append({"step": i, "action": act_type, "ok": True, "note": "executed in safe stub mode"})

        print(json.dumps({"ok": True, "results": results}))

    except Exception as e:
        print(json.dumps({"ok": False, "error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
