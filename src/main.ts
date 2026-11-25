import { kepubOpts } from './convert';
import { setMessage } from './dom';
import './edit';
 
function keypubifyCheckbox(key: string, desc: string) {
  const label = document.createElement('label')
  const input = label.appendChild(document.createElement('input'))
  input.type = 'checkbox'
  input.id = key
  input.classList.add('checkbox', 'checkbox-sm')
  input.name = key

  label.appendChild(document.createElement('span')).innerText = key.replace(/[A-Z]/g, s => ` ${s}`)

  const description = document.createElement('p')
  description.innerText = desc

  return [
    label,
    description
  ]
}

function epubFieldset() {
  const fieldset = document.querySelector('fieldset')!
  Object.entries(kepubOpts).forEach(([key, desc]) => {
    fieldset.append(...keypubifyCheckbox(key, desc))
  })

  const toggler = document.querySelector<HTMLInputElement>('#toggle-keypubify')!


  return {
    sync() {
      fieldset.disabled = !toggler.checked
    },
    toggler,
  }
}

function epubDropzone() {
    const dom = document.querySelector<HTMLFormElement>('#epub-dropzone')!

    const label = dom.querySelector('label')!
    return {
        dom,
        label,
        reset() {
            dom.classList.remove('droppable', 'no-drop')
        },
        async process(file?: File | null) {
            this.reset()
            if (file?.type != 'text/html') {
                setMessage('Please provide an ".html" file.')
            } else {
                const buffer = await file.text()
                navigation.navigate('', { state: { buffer } })
            }
        }
    }
}




const fieldset = epubFieldset()
fieldset.toggler.checked = false;

fieldset.toggler.addEventListener('change', () => {
  requestAnimationFrame(() => fieldset.sync())
}, { passive: true })


const dropzone = epubDropzone()

dropzone.label.addEventListener('dragenter', (ev) => {
  const droppable = ev.dataTransfer?.items[0]?.type == "text/html"
  dropzone.dom.classList.add(droppable ? 'droppable' : 'no-drop')
}, { passive: true })
dropzone.label.addEventListener('dragover', ev => ev.preventDefault())
dropzone.label.addEventListener('drop', ev => {
  ev.preventDefault()
  dropzone.process(ev.dataTransfer?.items[0]?.getAsFile());
})
dropzone.label.addEventListener('dragleave', ev => {
  if (ev.target == dropzone.label) {
    dropzone.reset()
  }
}, { passive: true })



const htmlInput = document.querySelector<HTMLInputElement>('#html-input')!

htmlInput.addEventListener('change', () => { dropzone.process(htmlInput.files?.item(0)); }, { passive: true })

navigation.addEventListener('currententrychange', function () {
  [...document.forms].forEach(form => form.reset())
  document.querySelectorAll('.toast').forEach(el => el.remove())
  document.querySelector('#message')?.classList.remove('visible')
})