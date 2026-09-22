#!/usr/bin/env python3
"""Linux validation supervisor. Example: script REPORT.json -- COMMAND ARG ...
Samples the descendant process tree's summed RSS, including WebView/engines.
Not PSS: shared pages may be counted more than once; short peaks can be missed.
"""
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time


def sample(root_pid):
    processes = {}
    for entry in Path('/proc').iterdir():
        if not entry.name.isdigit():
            continue
        try:
            fields = (entry / 'stat').read_text().rsplit(')', 1)[1].split()
            processes[int(entry.name)] = (int(fields[1]), int(fields[21]) * os.sysconf('SC_PAGE_SIZE'))
        except (OSError, ValueError, IndexError):
            pass  # A process can exit between listing and reading.
    children = {root_pid}
    while True:
        expanded = children | {pid for pid, (parent, _) in processes.items() if parent in children}
        if expanded == children:
            break
        children = expanded
    return sum(processes.get(pid, (0, 0))[1] for pid in children), len(children)


def main():
    if len(sys.argv) < 4 or sys.argv[2] != '--' or sys.platform != 'linux':
        raise SystemExit('Usage on Linux: desktop-resource-measure.py NEW_REPORT.json -- COMMAND ...')
    report = Path(sys.argv[1])
    # Reserve the report first: never silently replace prior evidence.
    with report.open('x') as dest:
        started = time.monotonic()
        cpu_started = time.process_time()
        child = subprocess.Popen(sys.argv[3:], start_new_session=True)
        measurements = []
        timed_out = False
        try:
            while child.poll() is None:
                tick = time.monotonic()
                if tick - started > 1800:
                    timed_out = True
                    break
                rss, count = sample(child.pid)
                measurements.append({'seconds': tick - started, 'rssBytes': rss, 'processCount': count, 'sampleSeconds': time.monotonic() - tick})
                time.sleep(max(0, 0.1 - (time.monotonic() - tick)))
        finally:
            # Only the isolated validation process group, including abandoned children.
            try:
                os.killpg(child.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            child.wait()
            mem = next(line for line in Path('/proc/meminfo').read_text().splitlines() if line.startswith('MemTotal:'))
            json.dump({'schema': 1, 'platform': os.uname().sysname + '-' + os.uname().machine,
                       'kernel': os.uname().release, 'memory': mem,
                       'cpu': json.loads(subprocess.check_output(['lscpu', '--json'], text=True)),
                       'disk': 'Virtual block storage; physical medium not verified',
                       'intervalMs': 100, 'metric': 'summed descendant RSS; shared pages may be counted repeatedly; transient peaks may be missed',
                       'exitCode': child.returncode, 'timedOut': timed_out,
                       'elapsedSeconds': time.monotonic() - started,
                       'samplerCpuSeconds': time.process_time() - cpu_started,
                       'peakRssBytes': max((m['rssBytes'] for m in measurements), default=0),
                       'samples': measurements}, dest, indent=2)
            dest.write('\n')
        return child.returncode if not timed_out else 124


if __name__ == '__main__':
    sys.exit(main())
