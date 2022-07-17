#include <RESENTMENT/package.h>
#include <RESENTMENT/download.h>
#include <stdio.h>
#include <libgen.h>
#include <unistd.h>
#include <string.h>
#include <sys/sysinfo.h>
#include <sys/stat.h>
#include <stdlib.h>
#include <dirent.h>

int run_with_chroot(char *root, int (*func)(void *), void *p);

char *find_source_path(char *build_base){
    char *source_path = NULL;

    DIR *dp = opendir(build_base)

    if (!dp) {
        return NULL;
    }

    struct dirent *entry;

    while((entry = readdir(dp))) {
        if (entry->d_name[0] == '.' || !strcmp(entry->d_name, "pckdir")) {
            continue;
        }

        source_path = malloc(strlen(build_base) + strlen(entry->d_name) + 2);
        sprintf(source_path, "%s/%s", build_base, entry->d_name);
        break;
    }

    closedir(dp);

    return source_path;
}

static const char *BUILD_BASE = "/usr/share/spkm/build/build_";
static const char *BUILD_FILE = ".build";
static const char *BUILD_LOG = "build.log";
static const char *PCKDIR = "pckdir";
static const char *INST_DIR = ".install";
static const char *INST_SCRIPT = ".install.sh";

typedef struct {
    RESENTMENT_package *pck;
}build_data;

static char *cache_file(char *root, char *file){
    char *filename = basename(file);
    char *dl_filename = malloc(strlen(root) + strlen(DL_CACHE) + strlen(filename) + 1);

    sprintf(dl_filename, "%s%s%s", root, DL_CACHE, filename);

    if (access(dl_filename, F_OK) == 0) {
        return dl_filename; // already downloaded...
    }

    if (!download_file(file, dl_filename)) {
        fprintf(stderr, "Failed to download: %s\n", file);
        free(dl_filename);
        return NULL;
    }

    return dl_filename;
}

int perform_build(void *p) {
    build_data *bd = p;

    char *build_base = malloc(strlen(BUILD_BASE) + strlen(bd->pck->name) + 1);
    sprintf(build_base, "%s/%s", BUILD_BASE, bd->pck->name);

    char *build_file = malloc(strlen(build_base) + strlen(BUILD_FILE) + 2);
    char *build_log = malloc(strlen(build_base) + strlen(BUILD_LOG) + 2);
    char *pck_base = malloc(strlen(build_base) + strlen(PCKDIR) + 2);

    sprintf(build_file, "%s/%s", build_base, BUILD_FILE);
    sprintf(build_log, "%s/%s", build_base, BUILD_LOG);
    sprintf(pck_base, "%s/%s", build_base, PCKDIR);

    setenv("P", pck_base, 1);
    free(pck_base);

    char mf[8];
    sprintf(mf, "-j%d", get_nprocs());
    setenv("MAKEFLAGS", mf, 1);

    chdir(build_base);
    printf("Changed into build base: %s\n", build_base);

    char *source_base = find_source_path(build_base);
    free(build_base);

    if (source_base) {
        chdir(source_base);
        printf("Changing to source path: %s\n", source_base);
        free(source_base);
    } else {
        printf("No source base, staying in build base\n");
    }

    int r = exec_command("bash", build_log, "-e", build_file, 0);

    free(build_log);
    free(build_file);

    return r;
}

bool package_build(char *root, RESENTMENT_package *pck) {
    if (pck->no_package){
        return true; // does not create package...
    }

    char package_path[1024];
    sprintf(package_path, "%s/usr/share/spkm/build/%s-%s-RESENTMENT OS-1.0.0.txz", root, pck->name, pck->version);

    if (access(package_path, F_OK) == 0) {
        printf("Not rebuilding, %s already exists. Delete to rebuild\n", package_path);
        sleep(2);
        return true;
    }

    printf("Building package: %s %s\n", pck->name, pck->version);
    sleep(2);

    char *src_filename = NULL;
    char *dl_filename = NULL;

    if (pck->source){
        src_filename = basename(pck->source);
        dl_filename = cache_file(root, pck->source);

        if (!dl_filename) {
            return false;
        }
    }

    char *build_base = malloc(strlen(root) + strlen(BUILD_BASE) + strlen(pck->name) + 1);
    sprintf(build_base, "%s%s%s", root, BUILD_BASE, pck->name);

    char *pck_base = malloc(strlen(build_base) + strlen(PCKDIR) + 2);
    sprintf(pck_base, "%s/%s", build_base, PCKDIR);

    char *src_files = malloc(strlen(pck->repo_path) + 3);
    char *build_install = malloc(strlen(build_base) + strlen(INST_DIR) + 2);
    char *pck_install = malloc(strlen(pck_base) + (INST_DIR) + 2);

    sprintf(build_install, "%s/%s", build_base, INST_DIR);
    sprintf(pck_install, "%s/%s", pck_base, INST_DIR);
    sprintf(src_files, "%s/*", pck->repo_path);

    #define CLEANUP() free(build_base); free(pck_base); free(src_files); free(build_install); free(pck_install); free(dl_filename);

    bool failure = false;

    if (access(build_base, F_OK) == 0) {
        fprintf(stderr, "Build directory exists, clean first! %s\n", build_base);
        failure = true;
    } else {
        failure |= mkdir(build_base, 0775) != 0;

        if (mkdir(pck_base, 0775)) {
            fprintf(stderr, "Failed to create build dir: %s\n", pck_base);
            failure = true;
        } else if (!copy_dir_contents(pck->repo_path, build_base)) {
            fprintf(stderr, "Failed to copy repo package data\n");
            failure = true;
        }
    }

    if (failure) {
        CLEANUP();
        return false;
    }

    if (access(build_install, F_OK) == 0) {
        // .install dir exists, move it to pckdir...
        if (exec_command("mv", 0, build_install, pck_install, 0)) {
            fprintf(stderr, "Failed to move install folder\n");
            CLEANUP();
            return false;
        }
    }

    if (exec_command("tar", 0, "-xhf", dl_filename, "-C", build_base, 0)) {
        fprintf("Failed to untar!\n");
        CLEANUP();
        return false;
    }

    str_list *l = &pck->extras;

    while(l && l->str) {
        if (!(strstr(l->str, "http:") == l->str || strstr(l->str, "https:") == l->str)) {
            // not a download...
            l = l->next;
            continue;
        }
 
        char *extra_filename = cache_file(root, l->str);

        if (!extra_filename) {
            CLEANUP();
            return false;
        }

        if (access(extra_filename, F_OK) == 0) {
            char *extra_filename = malloc(strlen(build_base) + strlen(basename(l->str)) + 2);
            sprintf(extra_file, "%s/%s", build_base, basename(l->str));

            bool copied = copy_file(extra_filename, extra_file);
            free(extra_file);
            free(extra_filename);

            if (!copied) {
                CLEANUP();
                return false;
            }
        }
    
        l = l->next;
    }

    build_data bd;
    bd.pck = pck;

    int ret = run_with_chroot(root, perform_build, &bd);

    if (ret) {
        fprintf(stderr, "Failed to build!\n");
        CLEANUP();
        return false;
    }

    printf("Build complete, packaging...\n");

    if (exec_command("tar", 0, "-cJpf", package_path, "-C", pck_base, ".", 0)) {
        fprintf(stderr, "Failed to create package!\n");
        CLEANUP();
        return false;
    }

    printf("Packaging complete: %s\n", package_path);

    remove_directory(build_base);

    printf("Removed: %s\n", build_base);

    CLEANUP();

    return true;
}