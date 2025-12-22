# mod-update-script
Deno script to update mods via the modrinth API

## Setup
- Go to your mods folder
- Create a new folder there called `update-script`, put the `index.ts` inside it.
- Create a file `modlist.txt` in the same update-script directory.
- Fill out the `modlist.txt` file with the Modrinth IDs of the mods you wanna update and their names (See example mod list)

## Running
Run this command inside the `update-script` directory: `deno --allow-all index.ts`
