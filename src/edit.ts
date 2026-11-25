import { AsyncZipDeflate, strToU8, unzip, Zip, type AsyncZipOptions, type Unzipped } from "fflate";
import { readFile, type Container } from "./convert";
import { setMessage } from "./msgs";
import { convert, type Options } from "kepubify";

let container: Container | null = null

const urlRE = /https?:\/\/\S+/
const coverContainer = document.querySelector<HTMLElement>("#cover")!

document.querySelector<HTMLButtonElement>("#reset-epub")?.addEventListener('click', () => {
    if (navigation.currentEntry?.index) navigation.back()
    else navigation.navigate('')
}, { passive: true })


function reset() {
    container?.dispose()
    coverContainer.querySelector('img')?.remove()
    container = null

}


navigation.addEventListener('navigate', (ev) => {
    if (!ev.canIntercept || ev.downloadRequest !== null) return

    ev.intercept({
        async handler() {
            const { buffer } = ev.destination.getState() ?? {}
            reset()
            if (typeof buffer == 'string') container = readFile(buffer)


            const tr = document.startViewTransition(() => {
                requestAnimationFrame(() => {
                    document.querySelector('main')?.classList.toggle('editing', !!container)
                })
                if (!container) {
                    return;
                }

                if (import.meta.env.DEV) console.log(container)
                document.querySelector('#epub-details h3')!.textContent = container.title ?? ''

                document.querySelector('#author')!.textContent = container.author ?? ''
                document.querySelector("#summary")!.textContent = container.summary ?? ''
            })

            await tr.ready;

        }
    })
})

async function getCover(url: string) {
    const resp = await fetch(url);
    const ct = resp.headers.get("content-type");
    if (!ct?.startsWith("image/"))
        throw new Error("Non image url provided");
    await processCover(resp, ct);
}


async function processCover(
    file: {
        bytes(): Promise<Uint8Array<ArrayBuffer>>;
    },
    type: string,
) {
    if (!container) {
        console.error("wtf no container found wtf did u do wrong");
        return;
    }
    const resp = await container.processCover(file, type)

    const img = document.createElement('img')
    img.src = resp.url
    img.alt = 'cover'
    img.classList.add('rounded')

    coverContainer.prepend(img)
}

const imgURLInput = document.querySelector<HTMLInputElement>('[name="img-url"]')!
imgURLInput.addEventListener('change', () => {
    if (!urlRE.test(imgURLInput.value)) return;
    getCover(imgURLInput.value)
        .catch((err) => {
            console.log({ err })
            setMessage(FileURLError)
        })
}, { passive: true })

imgURLInput.addEventListener('paste', ev => {
    ev.preventDefault()
    const file = ev.clipboardData?.files.item(0);
    if (!file) {
        setMessage('Could not detect image file in paste data')
        return
    }

    processCover(file, file.type)
        .catch(err => {
            console.error({ err })
            setMessage(FileURLError)
        })
})

const fileUploadInput = document.querySelector<HTMLInputElement>('footer input[type=file]')!

fileUploadInput.addEventListener('change', () => {
    const img = fileUploadInput.files?.item(0)
    if (!img?.type.startsWith('image')) {
        setMessage('No image found')
        return
    }

    processCover(img, img.type).catch(err => {
        console.log({ err })
        setMessage("Sorry :( Could not process image. IDK why either.")
    })
}, { passive: true })


const FileURLError =
    "Could not retrieve image. Try uploading file directly?";

const form = document.querySelector<HTMLFormElement>('#epub-opts')!

form.addEventListener('submit', ev => {
    ev.preventDefault();
    if (!container) {
        console.error("???? where is the fREAKING container")
        return
    }

    const kepub = (form.elements.namedItem('toggle-kepub') as HTMLInputElement)?.checked

    zipContainer(container, kepub ? Object.fromEntries([...form.querySelector('fieldset')!.elements].filter(e => e instanceof HTMLInputElement).map((input) => [input.name, input.checked])) : null)
})

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
    const buffer: number[] = []

    const dir = new Zip()
    dir.ondata = (err, data, final) => {
        if (err) reject(err)
        else {
            cb(data)
            buffer.push(...data)
        }
        if (final) resolve(new Uint8Array(buffer))
    }
    return {
        dir,
        promise
    }
}

function progressBar() {
    const el = document.createElement('progress')
    el.value = 0
    return el
}

function createLabel(text: string) {
    const span = document.createElement('span')
    span.textContent = text
    span.classList.add('label')

    return span
}

function progressContainer(label: string) {
    const wrapper = document.createElement('div')
    wrapper.classList.add('alert')
    wrapper.append(createLabel(label))

    return {
        wrapper,
        bar: wrapper.appendChild(progressBar()),
        set max(value: number) {
            this.bar.max = Number(value)
        },
        set value(value) {
            this.bar.value = Number(value)
        },
        get value() { return this.bar.value },
        toggle() {
            wrapper.classList.toggle('alert-soft')
         }
    }
}
async function zipContainer(container: Container, opts: Options | null) {
    const toast = document.createElement('div')
    toast.id = 'progress'
    toast.classList.add('toast')

    const files = Object.entries(container.files())

    const converter = progressContainer('Convert')
    toast.append(converter.wrapper)


    let kepubifyProgress: ReturnType<typeof progressContainer> | null = null
    if (opts) {
        kepubifyProgress = progressContainer('KEPUB')
        toast.append(kepubifyProgress.wrapper)
    }

    const finalise = progressContainer("Finalize")
    toast.append(finalise.wrapper)

    document.body.append(toast)

    converter.toggle()
    const toEpub = createZip(() => converter.value++)
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
            }
        })
        kepubifyProgress.toggle()
    }

    const finalFiles = Object.entries({
        mimetype: [strToU8('application/epub+zip'), { level: 0, consume: true }],
        ...await unzipFiles(buffer),
        ['toc.xhtml']: strToU8(container.toc)
    } as Record<string, Uint8Array<ArrayBuffer> | [Uint8Array<ArrayBuffer>, AsyncZipOptions]>)
    finalise.max = finalFiles.length
    const final = createZip(() => finalise.value++)
    finalise.toggle()

    finalFiles.forEach(([name, fileData]) => {
        if (fileData instanceof Uint8Array) {
            const file = new AsyncZipDeflate(name)
            final.dir.add(file)
            file.push(fileData, true)
        } else {
            const [buffer, opts] = fileData
            const file = new AsyncZipDeflate(name, opts)
            final.dir.add(file)
            file.push(buffer, true)
        }
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
    anchor.click()
}
