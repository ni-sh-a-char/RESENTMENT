#include <stdlib.h>
#include <unistd.h>
#include <dirent.h>
#include <stdio.h>
#include <sys/wait.h>

int run_with_chroot(char *root, int (*func)(void *), void *p) {
    pid_t pid = fork();

    if (pid == 0) {
        // in the new child process
        chdir(root);

        if (chroot(root)) {
            perror("Failed to chroot");
            return -1;
        }

        exit(func(p));
        //never gets here...
    }

    int stat = 0;

    if (waitpid(pid, &stat, 0) == -1) {
        return EXIT_FAILURE;
    }

    return WEXITSTATUS(stat);
}

int print_dir(void *p) {
    char *dir = p;
    printf("Directory: %s\n", dir);

    DIR *dp = opendir(dir);

    if (dp) {
        struct dirent *entry;

        while((entry = readdir(dp))) {
            printf("\t--- %s\n", entry->d_name);
        }

        closedir(dp);

        return 0;
    }

    return 7;
}

/*
int main() {
    printf("Result: %d\n", print_dir("/"));
    sleep(2);

    printf("Result: %d\n", run_with_chroot("/tmp", print_dir, "/"));
    sleep(2);

    printf("Result: %d\n", print_dir("/"));
    sleep(2);
}
*/