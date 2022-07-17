#pragma once

#include <RESENTMENT/common.h>

/* Structure for YAML document:

name: glibc
version: 2.33
repo: core
is_group: false
no_source: false
source: https://ftp.gnu.org/gnu/glibc/glibc-2.35.tar.xz
deps: [

]
mkdeps: [
    
]
extras: [
    'https://www.linuxfromscratch.org/patches/lfs/11.1/glibc-2.35-fhs-1.patch',
    'https://www.iana.org/time-zones/repository/releases/tzdata2021a.tar.gz'
]

*/
static const char *DL_CACHE = "/usr/share/spkm/dl-cache/";
static const char *BUILD_PATH = "/usr/share/spkm/build";

typedef struct {
    //yaml fields
    char *name;
    char *version;
    char *repo;
    char *source;
    bool is_group;
    bool no_package;
    str_list deps;
    str_list mkdeps;
    str_list extras;

    //temp fields
    bool installed;
    char *repo_path;
    bool is_dep;

} RESENTMENT_package;

u32 RESENTMENT_package_to_string(RESENTMENT_package *pck, char *buffer, u32 max_size);
RESENTMENT_package *package_load(char *root, char *name);

typedef struct package_list_entry_ {
    RESENTMENT_package *pck;
    struct package_list_entry_ *next;
} package_list_entry;

typedef struct {
    package_list_entry *head;
    package_list_entry *tail;
} package_list;

bool package_load_all(char *root, package_list *list);
RESENTMENT_package *package_list_find(package_list *list, char *name);
package_list_entry *package_list_add(package_list *list, RESENTMENT_package *pck);
bool package_is_installed(char *root, char *name);

typedef struct {
    char *root;
    char *pckm_base;

    package_list all_packages; //entire repo
    package_list packages; //packages to install/build
    RESENTMENT_package *cur_pck;

    //command line options.
    bool install;
    bool rebuild;
    bool verbose;
    bool rebuild_deps;

} spkm_context;

bool package_load_context(spkm_context *ctx, str_list *packages);
