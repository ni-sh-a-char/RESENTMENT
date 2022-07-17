//Simple Package Manager
#include <RESENTMENT/package.h>
#include <stdio.h>
#include <string.h>
#include <dirent.h>
#include <stdlib.h>
#include <unistd.h>
#include <argp.h>
#include <libgen.h>
#include <sys/stat.h>
#include <sys/wait.h>

static char doc[] = "RESENTMENT Package Manager";
static char args_doc[] = "PACKAGE_NAME";

static struct argp_option options[] = {
    { "root", 'r', "path", 0, "Alternative root filesystem" },
    { "install", 'i', 0, 0, "Install package" },
    { "rebuild", 'b', 0, 0, "Rebuild package" },
    { "rebuild-deps", 'd', 0, 0, "Rebuild package dependencies" },
    { "verbose", 'v', 0, 0, "Verbose logging" },
    {0}
};

static str_list package_names;

static error_t parse_opt(int key, char *arg, struct argp_state *state){
    spkm_context *ctx = state->input;

    switch (key) {
    case 'r':
        ctx->root = arg;
        break;
    
    case 'i':
        ctx->install = true;
        break;
            
    case 'b':
        ctx->rebuild = true;
        break;
            
    case 'd':
        ctx->rebuild_deps = true;
        break;
            
    case 'v':
        ctx->verbose = true;
        break;
                
    case ARGP_KEY_ARG:
        str_list_append(&package_names, arg);
        return 0;
    
    default:
        return ARGP_ERR_UNKNOWN;
    }

    return 0;
}

static struct argp argp = { options, parse_opt, args_doc, doc, 0, 0, 0};

bool package_build(char *root, RESENTMENT_package *pck);

bool package_install(spkm_context *ctx, RESENTMENT_package *pck){
    //TODO
    printf("Install skipping for now\n");
    return true;
}

int main(int argc, char **argv) {
    spkm_context ctx = {0};

    printf("RESENTMENT OS Simple Package Manager v1.0.0\n");

    argp_parse(&argp, argc, argv, 0, 0, &ctx);

    if (!ctx.root) {
        ctx.root = "/";
        char *root = getenv("SPKM_ROOT");

        if (root) {
            ctx.root = root;
        }
    }

    if (!package_names.str) {
        //need at least one package
        fprintf(stderr, "Package required!\n");
        return -1;
    }

    char base[1024];
    sprintf(base, "%s/usr/share/spkm", ctx.root);
    ctx.pckm_base = strdup(base);

    package_load_context(&ctx, &package_names);

    for (package_list_entry *e = ctx.packages.head; e != NULL; e = e->next){
        if (ctx.verbose) {
            printf("PACKAGE: %s\n", e->pck->name);
        }
    }

    for (package_list_entry *e = ctx.packages.head; e != NULL; e = e->next){
        if (!package_build(ctx.root, e->pck)){
            fprintf(stderr, "Build failure!\n");
            return -1;
        }

        if ((ctx.install || e->pck->is_dep) && !e->pck->installed){
            if (!package_install(&ctx, e->pck)) {
                fprintf(stderr, "Install Failure!\n");
                return -1;
            }
            printf("Package installed: %s\n", e->pck->name);
        }

    }

}
