//Simple Package Creator

#include <RESENTMENT/package.h>
#include <stdio.h>
#include <string.h>
#include <dirent.h>
#include <stdlib.h>
#include <unistd.h>
#include <argp.h>
#include <libgen.h>

static char doc[] = "RESENTMENT Package Creator";
static char args_doc[] = "Argument Details";

static struct argp_option options[] = {
    { "root", 'r', "path", 0, "Alternative root filesystem" },
    { "url", 'u', "url", 0, "Source URL"},
    { "package-name", 'p', "name", 0, "Package name"},
    { "version", 'v', "version", 0, "Version Information"},
    { "group", 'g', 0, 0, "Package is a group"},
    { "no-package", 'q', 0, 0, "No package to download for install"},
    { "deps", 'd', "dep names", 0, "Dependency Names (Comma Separated)"},
    { "mkdeps", 'm', "mkdeps", 0, "Make Dependency Names (Comma Separated)"},
    { "extras", 'e', "extra names", 0, "Extra Files (Comma Seperated)"},
    {0}
};

typedef struct {
    char *root;
    RESENTMENT_package pck;
}spkc_args;

static error_t parse_opt(int key, char *arg, struct argp_state *state){
    spkc_args *args = state->input;

    switch(key) {

        case 'r':
            args->root = arg;
            break;

        case 'u':
            args->pck.source = arg;
            break;

        case 'p':
            args->pck.name = arg;

        case 'v':
            args->pck.version = arg;
            break;

        case 'g':
            args->pck.is_group = true;
            break;

        case 'q':
            args->pck.no_package = true;
            break;

        case 'd':{
            str_list *l = str_list_from_str(arg, ",");
            str_list_copy(&args->pck.deps, l);
            str_list_free(l, true);
            break;
        }
    
        case 'm':{
            str_list *l = str_list_from_str(arg, ",");
            str_list_copy(&args->pck.mkdeps, l);
            str_list_free(l, true);
            break;
        }

        case 'e':{
            str_list *l = str_list_from_str(arg, ",");
            str_list_copy(&args->pck.extras, l);
            str_list_free(l, true);
            break;    
        }

        default:
            return ARGP_ERR_UNKNOWN;
    }

        return 0;
}

bool load_pck_from_source(spkc_args *args){
    char filename[1024];
    strcpy(filename, basename(args->pck.source));

    //gcc-10.23.0.tar.gz
    //gcc-shared-libs-10.23.0.txz
    char *end = strstr(filename, ".t");

    if (!end){
        return false;
    }

    *end = 0;

    end = strrchr(filename, '-');

    if (!end){
        return false;
    }

    char *ver = end + 1;
    *end = 0;

    args->pck.name = strdup(filename);
    args->pck.version = strdup(ver);

    return true;
}

static struct argp argp = { options, parse_opt, args_doc, doc, 0, 0, 0 };

int main(int argc, char **argv){
    spkc_args args = {0};

    printf("RESENTMENT OS - Simple Package Creator v 1.0.0\n\n");

    argp_parse(&argp, argc, argv, 0, 0, &args);

    if (!args.root){
        args.root = "/usr/share/spkc/repo";
        char *root = getenv("SPKC_ROOT");

        if (root) {
            args.root = root;
        }
    }

    if (!args.pck.name){
        if (!args.pck.source){
            printf("Must provide URL or name\n");
            return -1;
        }
        if (!load_pck_from_source(&args)){
            printf("Failed to parse URL\n");
            return -1;
        }
    }

    char str[1024];
    RESENTMENT_package_to_string(&args.pck, str, 1024);

    printf("Parsed Package:\n\n%s\n", str);


    return 0;
}