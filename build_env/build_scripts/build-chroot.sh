set -e

echo "Preparing ${LFS:?}"

chown -R root:root $LFS/{usr,lib,var,etc,bin,sbin,tools,lib64}
mkdir -pv $LFS/{dev,proc,sys,run}

mknod -m 600 $LFS/dev/console c 5 1
mknod -m 666 $LFS/dev/null c 1 3
fi

bash -e $DIST_ROOT/build_env/build_scripts/mount-virt.sh

if ! test -f $LFS/etc/passwd ; then
cat > $LFS/etc/passwd << "EOF"
root:x:0:0:root:/root:/bin/bash
bin:x:1:1:bin:/dev/null:/usr/bin/false
daemon:x:6:6:Daemon User:/dev/null:/usr/bin/false
messagebus:x:18:18:D-Bus Message Daemon User:/run/dbus:/usr/bin/false
uuidd:x:80:80:UUID Generation Daemon User:/dev/null:/usr/bin/false
nobody:x:99:99:Unprivileged User:/dev/null:/usr/bin/false
EOF

cat > $LFS/etc/group << "EOF"
root:x:0:
bin:x:1:daemon
sys:x:2:
kmem:x:3:
tape:x:4:
tty:x:5:
daemon:x:6:
floppy:x:7:
disk:x:8:
lp:x:9:
dialout:x:10:
audio:x:11:
video:x:12:
utmp:x:13:
usb:x:14:
cdrom:x:15:
adm:x:16:
messagebus:x:18:
input:x:24:
mail:x:34:
kvm:x:61:
uuidd:x:80:
wheel:x:97:
nogroup:x:99:
users:x:999:
EOF
fi

chroot "$LFS" /usr/bin/env -i   \
    HOME=/root                  \
    TERM="$TERM"                \
    PS1='(lfs chroot) \u:\w\$ ' \
    PATH=/bin:/usr/bin:/sbin:/usr/sbin \
    /dist/build_env/build_scripts/finish-chroot.sh

bash -e $DIST_ROOT/build_env/build_scripts/unmount-virt.sh

strip --strip-debug $LFS/usr/lib/* | true
strip --strip-unneeded $LFS/usr/{,s}bin/* | true
strip --strip-unneeded $LFS/tools/bin/* | true

rm -rf $LFS/sources
cd $LFS

tar -cJpf $DIST_ROOT/build_env/dist-temp-tools.txz .