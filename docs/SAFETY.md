# Safety

This document is the contract the implementation is written against.

## Hard rules

1. Files never leave the machine.
2. The AI service URL must be loopback. The Rust client rejects any other host.
3. AI output is treated as untrusted input.
4. AI may only return a category and subcategory from the owned tree.
5. Filenames are sanitized in Rust before any write: illegal characters,
   reserved Windows names, length, original extension preserved.
6. Destination paths are joined under the scanned root. `..`, drive letters
   and absolute paths are rejected.
7. Existing files are never overwritten. Collisions become `name_2.ext`.
8. Every mutation is inserted as `planned` before `rename(2)`, then updated
   to `completed` or `failed`.
9. Undo refuses to clobber a path that is now occupied.
10. Nothing is deleted. Duplicate extras are displayed only.

## Category tree

The model cannot invent folders. The application maps:

```
Finance + Invoices  ->  <scan-root>/Finance/Invoices/<sanitized-name>
```

See `shared/categories/category_tree.json`.

## What V1 will not do

- Automatic organization
- Cloud sync, accounts, remote APIs
- Video / audio understanding
- Large vision models
- Perceptual / near-duplicate hashing (planned later)
