
#define _XOPEN_SOURCE 500

#include <stdbool.h>
#include <stdio.h>
#include <string.h>
#include <dirent.h>
#include <stdlib.h>
#include <unistd.h>
#include <ftw.h>

static char *copy_to_path;
static char *copy_from_path;
static bool copy_busy = false;

bool copy_file(const char *from, char *to) {
    FILE *ff = fopen(from, "r");

    if (!ff) {
        perror("Can't open source file");
        return false;
    }

    FILE *ft = fopen(to, "w");

    if (!ft){
        perror("Can't open dest file");
        fclose(ff);
        return false;
    }

    char buffer[4 * 1024];
    size_t r = 0;

    while((r = fread(buffer, 1, sizeof(buffer), ff))) {
        fwrite(buffer, 1, r, ft);
    }

    fclose(ff);
    fclose(ft);

    return true;
}

static int cp_callback(const char *fpath, const struct stat *sb, int type_flag, struct FTW *ftwbuf) {
    char to_location[1024];
    sprintf(to_location, "%s/%s", copy_to_path, fpath + strlen(copy_from_path) + 1);

    if (type_flag & FTW_D) {
        // is a directory...

        if (ftwbuf->level == 0) {
            //level == 0 means we are in the same base directory, don't create that...
            return 0;
        }
    
        if (mkdir(to_location, 0775)) {
            perror("Failed to create directory");
            return -1;
        }
    } else if (!copy_file(fpath, to_location)) {
        return -1;
    }

    return 0;
}

static int cp_callback(const char *fpath, const struct stat *sb, int type_flag, struct FTW *ftwbuf) {

}

//copy path/* into to/
int copy_dir_contents(char *path, char *to) {

copy_busy = true;
copy_to_path = to;
copy_from_path = path;

    int ret = nftw(path, cp_callback, 64, FTW_PHYS);

    copy_busy = false;

    return ret;
}

// test the functions...
/*
int main() {
    return copy_dir_contents("a", "b");
}
*/