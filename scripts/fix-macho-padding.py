#!/usr/bin/env python3
"""
Fix Mach-O binaries where the LC_CODE_SIGNATURE data extends beyond __LINKEDIT.

Bun-compiled single executables can produce Mach-O binaries where the
LC_CODE_SIGNATURE load command references data beyond the __LINKEDIT segment's
filesize. This causes rcodesign to panic with:
  "range end index X out of range for slice of length Y"

This script expands __LINKEDIT's filesize (and vmsize) to cover the code
signature data, then pads the file with zeros if needed.
"""
import os
import struct
import sys

# Mach-O constants
MH_MAGIC_64 = 0xFEEDFACF
MH_CIGAM_64 = 0xCFFAEDFE
LC_SEGMENT_64 = 0x19
LC_CODE_SIGNATURE = 0x1D
PAGE_SIZE = 4096


def fix_macho(path):
    size = os.path.getsize(path)

    with open(path, "r+b") as f:
        magic = struct.unpack("<I", f.read(4))[0]

        if magic == MH_MAGIC_64:
            endian = "<"
        elif magic == MH_CIGAM_64:
            endian = ">"
        else:
            print(f"Not a 64-bit Mach-O (magic: 0x{magic:08X}), skipping")
            return

        f.seek(16)
        ncmds = struct.unpack(f"{endian}I", f.read(4))[0]

        # Scan load commands for __LINKEDIT and LC_CODE_SIGNATURE
        linkedit_cmd_offset = None
        linkedit_fileoff = None
        linkedit_filesize = None
        cs_dataoff = None
        cs_datasize = None

        offset = 32  # sizeof(mach_header_64)
        for _ in range(ncmds):
            f.seek(offset)
            cmd, cmdsize = struct.unpack(f"{endian}II", f.read(8))

            if cmd == LC_SEGMENT_64:
                segname = f.read(16).split(b"\x00")[0]
                if segname == b"__LINKEDIT":
                    linkedit_cmd_offset = offset
                    f.seek(offset + 40)
                    linkedit_fileoff, linkedit_filesize = struct.unpack(
                        f"{endian}QQ", f.read(16)
                    )
            elif cmd == LC_CODE_SIGNATURE:
                cs_dataoff, cs_datasize = struct.unpack(f"{endian}II", f.read(8))

            offset += cmdsize

        if linkedit_cmd_offset is None:
            print(f"No __LINKEDIT segment found in {path}, skipping")
            return

        if cs_dataoff is None:
            print(f"No LC_CODE_SIGNATURE found in {path}, skipping")
            return

        # Check if code signature extends beyond __LINKEDIT
        cs_end_in_linkedit = (cs_dataoff + cs_datasize) - linkedit_fileoff

        if cs_end_in_linkedit <= linkedit_filesize:
            print(
                f"No fix needed for {path} "
                f"(__LINKEDIT covers code signature: {linkedit_filesize} >= {cs_end_in_linkedit})"
            )
            return

        new_filesize = cs_end_in_linkedit
        new_vmsize = (new_filesize + PAGE_SIZE - 1) & ~(PAGE_SIZE - 1)

        print(f"Fixing {path}:")
        print(f"  __LINKEDIT fileoff={linkedit_fileoff}, filesize={linkedit_filesize}")
        print(f"  LC_CODE_SIGNATURE dataoff={cs_dataoff}, datasize={cs_datasize}")
        print(f"  Expanding __LINKEDIT filesize: {linkedit_filesize} -> {new_filesize}")
        print(f"  Expanding __LINKEDIT vmsize -> {new_vmsize}")

        # Update __LINKEDIT vmsize at cmd_offset + 32 and filesize at cmd_offset + 48
        f.seek(linkedit_cmd_offset + 32)
        f.write(struct.pack(f"{endian}Q", new_vmsize))
        f.seek(linkedit_cmd_offset + 48)
        f.write(struct.pack(f"{endian}Q", new_filesize))

        # Pad the file if needed
        new_total = linkedit_fileoff + new_filesize
        if new_total > size:
            f.seek(0, 2)
            f.write(b"\x00" * (new_total - size))
            print(f"  Padded file from {size} to {new_total} bytes")

        print(f"  Done")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} <binary>", file=sys.stderr)
        sys.exit(1)
    fix_macho(sys.argv[1])
