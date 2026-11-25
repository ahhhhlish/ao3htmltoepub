export function setMessage(msg: string, error = true) {
    const el = document.querySelector('#message')!
    el.textContent = msg
    el.classList.add(`alert-${error ? 'error' : 'success'}`, 'visible')
}

export class ProgressContainer {
    progress
    dom
    constructor(label: string) {
        const wrapper = this.dom = document.createElement('div')
        wrapper.classList.add('alert')

        const span = document.createElement('span')
        span.textContent = label
        span.classList.add('label')

        const progress = this.progress = document.createElement('progress')
        progress.value = 0

        wrapper.append(span, progress)
    }
    set max(value: number) {
        this.progress.max = Number(value)
    }

    get value() { return this.progress.value }
    set value(v) { this.progress.value = v }

    inc() {
        this.progress.value++
    }

    toggle() {
        this.dom.classList.toggle('alert-soft')
    }
}
