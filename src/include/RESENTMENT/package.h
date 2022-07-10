#pragma once

#include <RESENTMENT/common.h>

/* Structure for YAML document:

name: glibc
version: 2.33
repo: core
is_group: false
no_source: false
source: https://ftp.gnu.org/gnu/gcc/gcc-11.2.0/gcc-11.2.0.tar.xz
deps: [

]
mkdeps: [

]
extras: [
  'https://www.linuxfromscratch.org/patches/lfs/11.1/glibc-2.35-fhs-1.patch',
  'https://www.iana.org/time-zones/repository/releases/tzdata2021e.tar.gz'
]

*/

typedef struct {
    char *name;
    char *version;
    char *repo;
    char *source;
    bool is_group;
    bool no_source;
    str_list deps;
    str_list mkdeps;
    str_list extras;

} RESENTMENT_package;

