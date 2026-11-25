export function setMessage(msg: string, error = true) {
    const el = document.querySelector('#message')!
    el.textContent = msg
    el.classList.add(`alert-${error ? 'error' : 'success'}`, 'visible')
}
