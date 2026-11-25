 
import './edit';
import { setMessage } from './msgs';

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

const fieldset = document.querySelector('fieldset')!

fieldset.append(...keypubifyCheckbox('hyphenate', 'Force-enables (except in headings and table cells) or  force-disables hyphenation. If unset, it is left to the  book and reader styling.').concat(keypubifyCheckbox('smartypants', 'Converts punctuation to smart punctuation.')).concat(keypubifyCheckbox('dummyTitlepage', 'Force-enables or force-disables adding a dummy titlepage to fix layout issues in some books. If unset, a heuristic is used.').concat(keypubifyCheckbox('detectCover', "Shows the book's cover image on the dummy titlepage, if found."))))

const keypubToggler = document.querySelector<HTMLInputElement>('#toggle-keypubify')!

function toggleKeypub() {
  fieldset.disabled = !keypubToggler.checked
}

keypubToggler.checked = false

keypubToggler.addEventListener('change', () => { requestAnimationFrame(() => toggleKeypub()) }, { passive: true })



async function processFile(file?: File | null) {
  resetDropZone()
  if (file?.type != 'text/html') {
    setMessage('Please provide an ".html" file.')
    return
  }

  const buffer = await file.text()
  navigation.navigate('', { state: { buffer } })
}
const dropEpub = document.querySelector<HTMLFormElement>('#epub-dropzone')!

function resetDropZone() {
  dropEpub.classList.remove('droppable', 'no-drop')
}

const dropLabel = dropEpub.querySelector('label')!

dropLabel.addEventListener('dragenter', (ev) => {
  document.querySelector('#message')?.classList.remove('visible')
  const droppable = ev.dataTransfer?.items[0]?.type == "text/html"
  dropEpub.classList.add(droppable ? 'droppable' : 'no-drop')
}, { passive: true })

dropLabel.addEventListener('dragover', ev => ev.preventDefault())

dropLabel.addEventListener('drop', ev => {
  ev.preventDefault()
  processFile(ev.dataTransfer?.items[0]?.getAsFile());
})

dropLabel.addEventListener('dragleave', ev => {
  if (ev.target == dropLabel) {
    resetDropZone()
  }
}, { passive: true })

const htmlInput = document.querySelector<HTMLInputElement>('#html-input')!

htmlInput.addEventListener('change', () => { processFile(htmlInput.files?.item(0)); }, { passive: true })

navigation.addEventListener('currententrychange', function () {
  [...document.forms].forEach(form => form.reset())
  document.querySelectorAll('.toast').forEach(el => el.remove())
})