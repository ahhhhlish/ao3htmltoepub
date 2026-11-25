import { AsyncZipDeflate, strToU8, unzip, Zip, type Unzipped } from "fflate";
import { readFile, type Container } from "./convert";
import { ProgressContainer, setMessage } from "./dom";
import { convert, type Options } from "kepubify";

function coverContainer() {
    const dom = document.querySelector<HTMLElement>("#cover")!
    return {
        setImg(url: string) {
            let img = dom.querySelector('img')
            if (!img) {
                img = document.createElement('img')
                img.alt = 'cover'
                img.classList.add('rounded')
            }
            img.src = url
            return img
        },
        async process(file: {
            bytes(): Promise<Uint8Array<ArrayBuffer>>;
        },
            type: string, container: Container | null) {
            if (!container) {
                console.error("wtf no container found wtf did u do wrong. error u r an idiot");
                return;
            }
            const resp = await container.processCover(file, type)
            dom.prepend(this.setImg(resp.url))
        },
        async fetch(url: string) {
            const resp = await fetch(url);
            const ct = resp.headers.get("content-type");
            if (!ct?.startsWith("image/"))
                throw new Error("Non image url provided");
            return {
                type: ct,
                data: resp
            }
        },
        reset() { dom.querySelector('img')?.remove() }
    }
}

function epubContainer() {
    let container: Container | null = null

    return {
        reset() {
            container?.dispose()
            container = null
        },
        get current() { return container },
        set current(value) {
            this.reset()
            container = value
        },
    }
}

function unzipFiles(data: Uint8Array<ArrayBuffer>) {
    return new Promise<Unzipped>((res, rej) => {
        unzip(data, (err, data) => {
            if (err) rej(err)
            else res(data)
        })
    })
}

function createZip(cb: (data: Uint8Array<ArrayBuffer>) => void) {
    const { promise, reject, resolve } = Promise.withResolvers<Uint8Array<ArrayBuffer>>()
    const buffers: Uint8Array<ArrayBuffer>[] = []


    const dir = new Zip((err, data, final) => {
        if (err) reject(err)
        else {
            cb(data)
            buffers.push(data)

        }
        if (final) {
            const buffer = new Uint8Array(buffers.reduce((prev, curr) => prev + curr.length, 0))

            let length = 0;

            for (const buf of buffers) {
                buffer.set(buf, length)
                length += buf.length
            }

            resolve(buffer)

        }
    })
    return {
        dir,
        promise
    }
}

async function zipContainer(container: Container, opts: Options | null) {
    const toast = document.createElement('div')
    toast.id = 'toast'
    toast.classList.add('toast')

    const files = Object.entries(container.files())

    const converter = new ProgressContainer('Convert')
    toast.append(converter.dom)


    let kepubifyProgress: ProgressContainer | null = null
    if (opts) {
        kepubifyProgress = new ProgressContainer('KEPUB')
        toast.append(kepubifyProgress.dom)
    }

    const finalise = new ProgressContainer("Finalize")
    toast.append(finalise.dom)

    document.body.append(toast)

    converter.toggle()
    const toEpub = createZip(() => converter.inc())
    files.forEach(([name, buffer]) => {
        const file = new AsyncZipDeflate(name)
        toEpub.dir.add(file)
        file.push(buffer, true)
    })
    toEpub.dir.end()
    let buffer = await toEpub.promise
    converter.toggle()

    if (kepubifyProgress) {
        kepubifyProgress.max = 100
        kepubifyProgress.toggle()

        console.log(`Kepubifying with opts`, opts, container)
        buffer = await convert(buffer, {
            progress: (perc) => {
                kepubifyProgress.value = perc * 100
            },
            ...opts
        },)
        kepubifyProgress.toggle()
    }

    const finalFiles = Object.entries({
        mimetype: strToU8('application/epub+zip'),
        ...await unzipFiles(buffer),
        ['toc.xhtml']: strToU8(container.toc)
    })

    finalise.max = finalFiles.length
    const final = createZip(() => finalise.value++)
    finalise.toggle()

    finalFiles.forEach(([name, fileData]) => {
        if (import.meta.env.DEV) {
            console.debug(`Adding file: %s`, name, fileData)
        }
        const file = new AsyncZipDeflate(name)
        final.dir.add(file)
        file.push(fileData, true)
    })

    final.dir.end()

    buffer = await final.promise
    finalise.toggle()

    if (import.meta.env.DEV) {
        const { EpubCheck } = await import('@likecoin/epubcheck-ts')
        console.log(await EpubCheck.validate(buffer, { version: '3.3', includeInfo: true, includeUsage: true }))
    }

    let download = `${container.title}.epub`
    if (opts) download = download.replace('epub', 'kepub.epub')

    const anchor = container.createDownload(download, buffer)

    anchor.classList.add('alert', 'alert-soft')
    toast.append(anchor)

    if (import.meta.env.DEV) {
        console.log(container)
    } else {
        anchor.click()
    }
}

const urlRE = /https?:\/\/\S+/
const fileURLError =
    "Could not retrieve image. Try uploading file directly?";


const cover = coverContainer()
const container = epubContainer()

navigation.addEventListener('navigate', (ev) => {
    if (!ev.canIntercept || ev.downloadRequest !== null) return
    ev.intercept({
        async handler() {
            const { buffer } = ev.destination.getState() ?? {}

            container.reset()
            cover.reset()

            if (typeof buffer == 'string') container.current = readFile(buffer)

            const tr = document.startViewTransition(() => {
                requestAnimationFrame(() => {
                    document.querySelector('main')?.classList.toggle('editing', !!container.current)
                })
                if (!container.current) {
                    return;
                }

                if (import.meta.env.DEV) console.log(container.current)
                document.querySelector('#epub-details h3')!.textContent = container.current.title ?? ''

                document.querySelector('#author')!.textContent = container.current.author ?? ''
                document.querySelector("#summary")!.textContent = container.current.summary ?? ''
            })

            await tr.ready;

        }
    })
})

const imgURLInput = document.querySelector<HTMLInputElement>('[name="img-url"]')!

imgURLInput.addEventListener('change', () => {
    if (!urlRE.test(imgURLInput.value)) return;
    cover.fetch(imgURLInput.value)
        .then((resp) => cover.process(resp.data, resp.type, container.current))
        .catch((err) => {
            console.log({ err })
            setMessage(fileURLError)
        })
}, { passive: true })

imgURLInput.addEventListener('paste', ev => {
    ev.preventDefault()
    const file = ev.clipboardData?.files.item(0);
    if (!file) {
        setMessage('Could not detect image file in paste data')
        return
    }

    cover.process(file, file.type, container.current)
        .catch(err => {
            console.error({ err })
            setMessage(fileURLError)
        })
})

const fileUploadInput = document.querySelector<HTMLInputElement>('footer input[type=file]')!
fileUploadInput.addEventListener('change', () => {
    const img = fileUploadInput.files?.item(0)
    if (!img?.type.startsWith('image')) {
        setMessage('No image found')
        return
    }

    cover.process(img, img.type, container.current).catch(err => {
        console.log({ err })
        setMessage("Sorry :( Could not process image. IDK why either.")
    })
}, { passive: true })

const form = document.querySelector<HTMLFormElement>('#epub-opts')!

form.addEventListener('submit', ev => {
    ev.preventDefault();
    if (!container.current) {
        console.error("???? where is the fREAKING container. u done goofed")
        return
    }

    const kepub = (form.elements.namedItem('toggle-kepub') as HTMLInputElement)?.checked

    zipContainer(container.current, kepub ? Object.fromEntries([...form.querySelector('fieldset')!.elements].filter(e => e instanceof HTMLInputElement).map((input) => [input.name, input.checked])) : null)
})

form.addEventListener('reset', () => {
    cover.reset()
   container.reset()
}, { passive: true })

document.querySelector<HTMLButtonElement>("#reset-epub")?.addEventListener('click', () => {
    if (navigation.currentEntry?.index) navigation.back()
    else navigation.navigate('')
}, { passive: true })
