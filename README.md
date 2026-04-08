# mod-update-script
Deno script to update mods via the modrinth API

## Setup
- Download the `index.ts` script somewhere
- Create a file `modlist.txt` in the same directory as the `index.ts`.
- Fill out the `modlist.txt` file with the Modrinth IDs of the mods you wanna update and their names (See example mod list)
- Copy the file path of your mods folder

## Running
Run `deno --allow-all index.ts --output-dir=MODS_FOLDER_HERE`

## Command Line Arguments
```txt
index.ts --version=<mc version> --loader=<fabric|forge|neoforge|whatever> --modlist-file=<modlist file path> --output-dir=<output directory path>
```
#### `--version`
Sets the game version the script downloads mods for, defaults to `1.21.11`
#### `--loader`
Sets the mod loader the script downloads mods for, defaults to `fabric`
#### `--modlist-file`
Sets the path of the modlist txt file, defaults to `modlist.txt`
#### `--output-dir`
Sets the directory the downloaded mods are placed into, defaults to mods folder inside Minecraft install location
