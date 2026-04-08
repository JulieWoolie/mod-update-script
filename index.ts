import * as npath from "node:path"
import * as https from "node:https"
import * as fs from "node:fs"
import { parseArgs } from "jsr:@std/cli/parse-args";

export {}

interface Params {
  version: string
  loader: string
  modlistFile: string
  outputDir: string
}

interface ModEntry {
  id: string,
  name: string
}

interface DownloadEntrySuccess {
  type: "found"
  mod: ModEntry
  downloadUrl: string
  filename: string
  version: string
  olderFileNames: string[]
}

interface DownloadEntryError {
  type: "err"
  mod: ModEntry
  message: string
}

type DownloadEntry = DownloadEntryError | DownloadEntrySuccess

const LOADER = `fabric`
const VERSION = `1.21.11`
const MODLIST_FILE = "./modlist.txt"
const OUTPUT_DIR = `${getMinecraftFolder()}/mods`
const API_BASE_URL = `https://api.modrinth.com/v2`
const PRINT_BORDER = `---------------------------------------------------`

function getMinecraftFolder(): string {
  const os = Deno.build.os

  if (os == "windows") {
    const appdata = Deno.env.get("APPDATA")
    if (!appdata) {
      throw "No APPDATA env variable"
    }
    return `${appdata}/.minecraft`
  }

  const home = Deno.env.get("HOME") || Deno.env.get("USERPROFILE")
  if (!home) {
    throw "HOME env variable not set"
  }

  if (os == "darwin") {
    return `${home}/Library/Application Support/minecraft`
  }
  if (os == "linux") {
    return `${home}/.minecraft`
  }

  throw "Unsupported Operating System"
}

main()

async function main() {
  const params: Params = setupParams()

  console.log(PRINT_BORDER)
  console.log("Running mod update script...")
  console.log("")
  console.log("Parameters:")
  console.log(`  Target version = ${params.version}`)
  console.log(`  Loader = ${params.loader}`)
  console.log(`  Modlist file = ${params.modlistFile}`)
  console.log(`  Output directory = ${params.outputDir}`)
  console.log(PRINT_BORDER)

  if (!fileExists(params.modlistFile)) {
    console.log(`[FAILED ] Modlist file (${params.modlistFile}) does not exist`)
    return
  }

  if (!fileExists(params.outputDir)) {
    fs.mkdirSync(params.outputDir, {recursive: true})
    console.log("[INFO   ] Created output folder")
  }

  let modlist: ModEntry[]
  try {
    modlist = await loadModList(params.modlistFile)
  } catch (err) {
    console.log(`[FAILED ] Error loading modlist txt file`, err)
    return
  }

  let entries: DownloadEntry[]
  try {
    entries = await findUrlsAndVersions(params, modlist)
  } catch (err) {
    console.log(`[FAILED ] Error getting Mod URLs and versions`, err)
    return
  }

  await downloadEntries(entries, params)

  console.log(PRINT_BORDER)
}

async function downloadEntries(entries: DownloadEntry[], params: Params) {
  let failed = 0
  let succeeded = 0
  let toDownloadCount = 0

  for (const e of entries!) {
    if (e.type == "err") {
      console.log(`[FAILED ] ${e.mod.name} failed to find: ${e.message}`)
      failed++
      continue
    }

    const outPath = `${params.outputDir}/${e.filename}`

    if (!fileExists(outPath)) {
      console.log(`[SUCCESS] ${e.mod.name} found. filename = ${e.filename}`)
      toDownloadCount++
    }

    succeeded++
  }

  console.log(`[INFO   ] Found ${succeeded} mods, failed to find ${failed} mods, total: ${entries.length}`)

  if (toDownloadCount > 0) {
    console.log("Downloading...")
  } else {
    return
  }

  for (const entry of entries) {
    if (entry.type == "err") {
      continue
    }

    const outPath = `${params.outputDir}/${entry.filename}`
    if (fileExists(outPath)) {
      continue
    }

    // Delete older versions
    for (const oldFile of entry.olderFileNames) {
      const oldPath = `${params.outputDir}/${oldFile}`
      console.log(`  old path: ${oldFile}`)
      if (!fileExists(oldPath)) {
        continue
      }
      fs.rmSync(oldPath)
      console.log(`[DELETED] Deleted old mod version: ${oldFile}`)
    }

    try {
      await download(entry.downloadUrl, outPath)
      console.log(`[SUCCESS] Downloaded ${entry.filename}`)
    } catch (err) {
      console.log(`Failed to download ${entry.filename} (mod = ${entry.mod.name}):`, err)
    }
  }
}

async function findUrlsAndVersions(params: Params, modlist: ModEntry[]): Promise<DownloadEntry[]> {
  const arr: DownloadEntry[] = []

  for (const mod of modlist) {
    const apiUrl = `${API_BASE_URL}/project/${mod.id}/version?loaders=["${params.loader}"]&game_versions=["${params.version}"]&incldude_changelog=false`

    try {
      const result = await findModVersion(apiUrl, mod, params)
      arr.push(result)
    } catch (exc) {
      const err: DownloadEntryError = {
        type: "err",
        message: "Failed to fetch: " + exc,
        mod: mod
      }
      arr.push(err)
    }
  }

  return arr
}

async function findModVersion(apiUrl: string, mod: ModEntry, params: Params): Promise<DownloadEntry> {
  const response = await fetch(apiUrl)
  const json = await response.json()

  if (json.length < 1) {
    return {
      type: "err",
      message: `Unable to find ${params.loader} mod for version ${params.version}`,
      mod
    }
  }

  for (let i = 0; i < json.length; i++) {
    const versionData = json[i]
    if (versionData.status != "listed") {
      continue
    }

    const file = versionData.files[0]
    const oldVersions: string[] = []

    for (let pi = i + 1; pi < json.length; pi++) {
      const oldv = json[pi]
      const oldFiles = oldv.files

      for (const fdata of oldFiles) {
        oldVersions.push(fdata.filename)
      }
    }

    return {
      type: "found",
      mod,
      downloadUrl: file.url,
      filename: file.filename,
      version: versionData.version_number,
      olderFileNames: oldVersions
    }
  }

  return {
    type: "err",
    message: `Unable to find ${params.loader} mod listed for version ${params.version}`,
    mod
  }
}

function fileExists(path: string): boolean {
  return fs.existsSync(path)
}

async function download(url: string, outputPath: string): Promise<void> {
  const dirname = npath.dirname(outputPath)
  if (!fileExists(dirname)) {
    fs.mkdirSync(dirname)
  }

  const stream = fs.createWriteStream(outputPath)

  return new Promise((res, rej) => {
    https.get(url, response => {
      if (response.statusCode !== 200) {
        rej(`Failed to get ${url} (${response.statusCode})`)
        return
      }

      response.pipe(stream)

      stream.on('finish', () => {
        stream.close()
        res()
      })

      stream.on('error', (err) => {
        fs.unlinkSync(outputPath)
        rej(err)
      })
    }).on('error', rej)
  })
}

function setupParams(): Params {
  const args = Deno.args

  const parsed: any = parseArgs(Deno.args, {
    string: ["loader", "version", "modlist-file", "output-dir"],
    default: {
      "loader": LOADER,
      "version": VERSION,
      "modlist-file": MODLIST_FILE,
      "output-dir": OUTPUT_DIR
    }
  })

  return {
    loader: parsed.loader,
    version: parsed.version,
    modlistFile: tryResolveRealpath(parsed["modlist-file"]),
    outputDir: tryResolveRealpath(parsed["output-dir"]),
  }
}

function tryResolveRealpath(path: string): string {
  try {
    return fs.realpathSync(path)
  } catch (err) {
    return path
  }
}

async function loadModList(fname: string): Promise<ModEntry[]> {
  const arr: ModEntry[] = []
  const str: string = fs.readFileSync(fname).toString()

  const split: string[] = str.split(/[\r\n]+/)

  for (const kv of split) {
    const elements: string[] = kv.split(/\s+/)

    const id = elements[0]
    let name = ""

    for (let i = 1; i < elements.length; i++) {
      if (i != 1) {
        name += " "
      }
      name += elements[i];
    }

    arr.push({id, name})
  }

  return arr
}
