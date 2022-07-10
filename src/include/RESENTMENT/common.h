#pragma once

#include <stdint.h>
#include <stdbool.h>

typedef uint64_t u64;
typedef uint32_t u32;
typedef uint16_t u16;
typedef uint8_t u8;

typedef struct str_list_{
    char *str;
    struct str_list_ *next;
} str_list;
