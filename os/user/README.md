# The OS's programs for the kernel

Everything here is added to the kernel's initial ramdisk when the OS builds
it (`make kernel` passes this directory as `USER_EXTRA`). They land beside
the kernel's own programs under `/boot/bin` and run with the same rules:
no permissions until granted.

| Program | What it prints | Needs |
|---|---|---|
| `bin/facts.she` | the machine as `key=value` lines: arch, cpus, free memory, digest, clock angles, boot count | graph, time, read |
| `bin/pulse.she` | the current digest sealed for sixty seconds | graph, cap |

Run one from the desktop's Kernel window, or over the bridge from a script:

```
resentment> .allow all
resentment> .run /boot/bin/facts.she
arch=x86_64
cpus=4
...
```
