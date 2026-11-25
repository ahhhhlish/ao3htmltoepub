const parser = new DOMParser()
const serialiser = new XMLSerializer()




const publishedRE = /Published: (?<Published>\d{4}-\d{2}-\d{2})/
const chaptersRE = /Chapters: (?<Chapters>\d+)\/\d+/

function getMeta(doc: Document) {
    const container = doc.querySelector("#preface .meta");

    const stats = container?.querySelector(
        ".tags dd:last-of-type",
    )?.textContent;

    return {
        title: container?.querySelector("h1")?.textContent,
        author: container?.querySelector("[rel=author]")?.textContent,
        summary: container?.querySelector(".userstuff")?.textContent,
        tags: [...(container?.querySelectorAll(".tags dd a") ?? [])].map(
            (e) => e.textContent,
        ),
        published: stats?.match(publishedRE)?.groups?.Published,
        chapters: Number(stats?.match(chaptersRE)?.groups?.Chapters),
    };
}

const PAGE_HEAD = `
<head><meta content="ie=edge" http-equiv="x-ua-compatible"/>
<title>{{title}}</title>
<meta http-equiv="Content-Type" content="text/html; charset=utf-8"/>
<link rel="stylesheet" type="text/css" href="stylesheet.css"/></head>
`

class Page {
    header
    constructor(readonly index: number = 0, header: string | Element) {
        if (typeof header == 'string') {
            this.header = document.createElement('h2')
            this.header.classList.add('heading')
            this.header.textContent = header
        } else {
            this.header = header
        }
    }

    contents: string[] = []

    create(title: string) {

        return `<?xml version='1.0' encoding='utf-8'?><html xmlns="http://www.w3.org/1999/xhtml" lang="en" xml:lang="en">${PAGE_HEAD.replace('{{title}}', title)}<body>${serialiser.serializeToString(this.header)}${this.contents.join('\n')}</body></html>`
    }

    withContents(elements: Element[]) {
        this.contents.push(...elements.map(e => serialiser.serializeToString(e)))
        return this
    }
}

const CONTAINER_XML = `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
   <rootfiles>
      <rootfile full-path="content.opf" media-type="application/oebps-package+xml"/>
   </rootfiles>
</container>`

function escapeString(string: string) {
    return string.replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}
export class Container {
    sluggedTitle
    pages: Page[]

    readonly title
    readonly tags
    readonly author
    readonly summary
    readonly published
    //  opf
    constructor(readonly doc: Document) {
        const meta = getMeta(doc);

        this.title = meta.title
        this.tags = meta.tags
        this.author = meta.author
        this.summary = meta.summary
        this.published = meta.published

        this.sluggedTitle = meta.title?.replaceAll(" ", "_")
        this.pages = [new Page(0, 'Preface').withContents([...doc.querySelector('#preface')!?.querySelectorAll('*:not(h2)')])]

    }

    addPage(title: Element | string) {
        const page = new Page(this.lastPage.index + 1, title)
        this.pages.push(page)
        return page
    }
    get lastPage() {
        return this.pages[this.pages.length - 1]
    }

    get opf() {
        const { doc, title, author, summary, tags, published, pages } = this
        return `<?xml version='1.0' encoding='utf-8'?>
        <package xmlns="http://www.idpf.org/2007/opf" xmlns:opf="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id">
          <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
             <dc:identifier id='book-id'>${doc.querySelector("#preface .message a:last-of-type")?.textContent.slice(34)}</dc:identifier>
             <dc:title>${escapeString(title ?? '')}</dc:title>
            <dc:language>${doc.documentElement.lang}</dc:language>
            <dc:creator>${author}</dc:creator>
            <dc:description>${escapeString(summary ?? '')}</dc:description>
            <dc:publisher>Archive of Our Own</dc:publisher>
             ${tags.map((e) => `<dc:subject>${escapeString(e)}</dc:subject>`).join('\n')}
           <dc:date>${published}</dc:date>
           <meta property="dcterms:modified">${new Date().toISOString().slice(0, -5)}Z</meta>
        </metadata>
         <manifest>
            <item id="css" href="stylesheet.css" media-type="text/css"/>
            <item id="toc" href="toc.xhtml" media-type="application/xhtml+xml" properties="nav"/>
           ${pages.map((_, i) => `<item id='html${i}' href='${this.sluggedTitle}_split_${String(i).padStart(3, "0")}.xhtml'  media-type="application/xhtml+xml"/>`).join('\n')}${this.#image ? `<item id="coverimage" href="cover.${this.#image.type.slice(6)}" media-type="${this.#image.type}" properties="cover-image"/>` : ''}
        </manifest>
         <spine>
          ${pages.map((_, i) => `<itemref idref='html${i}'/>`).join('\n')}
         </spine>
        </package>
         `
    }

    get toc() {
        return `<?xml version='1.0' encoding='utf-8'?>
        <html xmlns:epub="http://www.idpf.org/2007/ops" xmlns="http://www.w3.org/1999/xhtml" xml:lang="en" lang="en"><head><title>Table of Contents</title></head><body><nav epub:type="toc"><h2>${this.title}</h2><ol>${this.pages.map(e => `<li><a href='${this.sluggedTitle}_split_${String(e.index).padStart(3, '0')}.xhtml'>${e.header.textContent.trim()}</a></li>`).join('\n')}</ol></nav></body></html>`
    }

    #finalised = false
    finalise() {
        if (this.#finalised) return;
        this.#finalised = true
        const after = this.addPage("Afterword")
        after.withContents([...this.doc.querySelector('#afterword')!?.querySelectorAll('*:not(h2)')])
    }

    #image?: {
        type: string
        data: Uint8Array<ArrayBuffer>
        url: string
    } | null

    #destroyImage() {
        if (this.#image) URL.revokeObjectURL(this.#image.url)
        this.#image = null;
    }

    async processCover(file: {
        bytes(): Promise<Uint8Array<ArrayBuffer>>;
    }, type: string) {
        this.#destroyImage()

        const buffer = await file.bytes();
        this.#image = {
            type,
            url: URL.createObjectURL(new Blob([buffer], {type})),
            data: buffer
        }

        console.debug(`Added image: `, this.#image)

        return this.#image
    }
    
     files() {
        this.finalise()
        const files: AsyncZippable = this.#image ? { [`cover.${this.#image.type.slice(6)}`]: new Uint8Array(this.#image.data) } : {}

        this.pages.forEach((page) => {
            files[`${this.sluggedTitle}_split_${String(page.index).padStart(3, '0')}.xhtml`] = strToU8(page.create(this.doc.title))
        })

        return {
            ...files,
            'stylesheet.css': strToU8(this.doc.querySelector('head style')?.textContent ?? ''),
            'META-INF/container.xml': strToU8(CONTAINER_XML),
            'content.opf': strToU8(this.opf),
        }
    }
    anchor?: HTMLAnchorElement | null

    #destroyAnchor() {
        if (this.anchor) {
            URL.revokeObjectURL(this.anchor.href)
            this.anchor.remove()
        }
        this.anchor = null
    }
    createDownload(title: string, data: Uint8Array<ArrayBuffer>) {
        this.#destroyAnchor()
        const url = URL.createObjectURL(new Blob([data], { type: "application/epub+zip" }))

        const el = document.createElement('a')
        el.download = title
        el.href = url
        el.innerText = 'Download'
        this.anchor = el
        return el
    }

    dispose() {
        this.#destroyImage()
        this.#destroyAnchor()
    }



}
import { strToU8, type AsyncZippable } from 'fflate'
export function readFile(text: string) {
    const doc = parser.parseFromString(text, "text/html");
    const container = new Container(doc)

    const chapters = doc.querySelector('#chapters')!

    for (let i = 0; i < chapters.childElementCount; i++) {
        const node = chapters.children.item(i)
        if (!node) break;
        if (node.classList.contains('group')) {
            container.addPage(node?.firstElementChild!)
        } else {
            container.lastPage.withContents([node])
        }
    }

    container.finalise()
    return container
}

