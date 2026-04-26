import './style.css'
import { uploadFile, loadProjects, insertProject, deleteProject, updateProject } from './supabase.js'

// ── State ──────────────────────────────────────────────────────────────────
let uploadedMediaFiles = []
let uploadedTeamPhoto = null
let selectedTools = []
const projectsMap = {}

// ── Admin ──────────────────────────────────────────────────────────────────
// Default password is 'archipelago2026' — override with VITE_ADMIN_PASSWORD env var in Vercel
const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD || 'archipelago2026'
const isAdmin = new URLSearchParams(window.location.search).get('admin') === ADMIN_PASSWORD

// ── Tabs ───────────────────────────────────────────────────────────────────
window.switchTab = function(tab, btn) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'))
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'))
  document.getElementById(tab).classList.add('active')
  btn.classList.add('active')
  if (tab === 'gallery') renderGallery()
}

// ── Tools ──────────────────────────────────────────────────────────────────
window.toggleTool = function(el) {
  el.classList.toggle('selected')
  const t = el.textContent
  if (el.classList.contains('selected')) selectedTools.push(t)
  else selectedTools = selectedTools.filter(x => x !== t)
}

window.addCustomTool = function() {
  const inp = document.getElementById('custom-tool')
  const val = inp.value.trim()
  if (!val) return
  const chip = document.createElement('span')
  chip.className = 'tool-chip selected'
  chip.textContent = val
  chip.onclick = function() { window.toggleTool(this) }
  document.getElementById('tool-chips').appendChild(chip)
  selectedTools.push(val)
  inp.value = ''
}

document.getElementById('custom-tool').addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); window.addCustomTool() }
})

// ── Members ────────────────────────────────────────────────────────────────
window.addMember = function() {
  const row = document.createElement('div')
  row.className = 'member-row'
  row.innerHTML = `
    <input type="text" placeholder="Name" class="m-name">
    <input type="text" placeholder="LinkedIn URL" class="m-linkedin">
    <input type="email" placeholder="Email" class="m-email">
    <button class="remove-btn" onclick="removeMember(this)">✕</button>`
  document.getElementById('members-list').appendChild(row)
}

window.removeMember = function(btn) {
  if (document.querySelectorAll('.member-row').length > 1) btn.parentElement.remove()
}

// ── File selection ─────────────────────────────────────────────────────────
window.handleFile = function(input, type) {
  if (type === 'media') {
    const newFiles = Array.from(input.files)
    uploadedMediaFiles = [...uploadedMediaFiles, ...newFiles]
    renderMediaPreviews()
    input.value = ''
  } else {
    const file = input.files[0]
    if (!file) return
    document.getElementById('team-file-name').textContent = file.name
    uploadedTeamPhoto = file
  }
}

window.removeMediaFile = function(index) {
  uploadedMediaFiles.splice(index, 1)
  renderMediaPreviews()
}

function renderMediaPreviews() {
  const strip = document.getElementById('media-preview')
  strip.innerHTML = uploadedMediaFiles.map((f, i) => `
    <div class="preview-thumb">
      <img src="${URL.createObjectURL(f)}" alt="${f.name}">
      <button class="remove-img" onclick="removeMediaFile(${i})">✕</button>
    </div>`).join('')
}

// ── Submit ─────────────────────────────────────────────────────────────────
window.submitProject = async function() {
  const name = document.getElementById('f-name').value.trim()
  const desc = document.getElementById('f-desc').value.trim()
  const link = document.getElementById('f-link').value.trim()
  const problem = document.getElementById('f-problem').value.trim()
  const whoBenefits = document.getElementById('f-benefits').value.trim()
  const howItWorks = document.getElementById('f-howit').value.trim()

  if (!name || !desc) { showStatus('Please fill in project name and description.', 'error'); return }
  if (selectedTools.length === 0) { showStatus('Please select at least one tool.', 'error'); return }

  const members = []
  document.querySelectorAll('.member-row').forEach(row => {
    const n = row.querySelector('.m-name').value.trim()
    if (n) members.push({
      name: n,
      linkedin: row.querySelector('.m-linkedin').value.trim(),
      email: row.querySelector('.m-email').value.trim()
    })
  })
  if (members.length === 0) { showStatus('Please add at least one team member.', 'error'); return }

  const btn = document.getElementById('submit-btn')
  btn.disabled = true
  showStatus('', '')

  let mediaUrl = ''
  let mediaType = 'image'
  let teamPhotoUrl = ''

  try {
    if (uploadedMediaFiles.length > 0) {
      btn.textContent = `Uploading ${uploadedMediaFiles.length} image(s)…`
      setProgress('media-progress', true)
      const urls = await Promise.all(uploadedMediaFiles.map(f => uploadFile(f, 'media')))
      mediaUrl = JSON.stringify(urls)
      setProgress('media-progress', false)
    }

    if (uploadedTeamPhoto) {
      btn.textContent = 'Uploading team photo…'
      setProgress('team-progress', true)
      teamPhotoUrl = await uploadFile(uploadedTeamPhoto, 'team-photos')
      setProgress('team-progress', false)
    }

    btn.textContent = 'Submitting…'
    await insertProject({ name, description: desc, link, problem, who_benefits: whoBenefits, how_it_works: howItWorks, tools: selectedTools.join(', '), media_url: mediaUrl, media_type: mediaType, team_photo_url: teamPhotoUrl, members })

    showStatus('🎉 Project submitted successfully!', 'success')
    btn.textContent = 'Submitted!'

    setTimeout(() => {
      window.switchTab('gallery', document.querySelector('.tab-btn'))
      btn.disabled = false
      btn.textContent = 'Submit Project'
    }, 2000)

  } catch (err) {
    console.error(err)
    showStatus('Submission failed: ' + (err.message || err), 'error')
    btn.disabled = false
    btn.textContent = 'Submit Project'
    setProgress('media-progress', false)
    setProgress('team-progress', false)
  }
}

function setProgress(id, active) {
  const el = document.getElementById(id)
  if (active) el.classList.add('uploading')
  else el.classList.remove('uploading')
}

function showStatus(msg, type) {
  const el = document.getElementById('status-msg')
  el.textContent = msg
  el.className = 'status-msg ' + type
}

// ── Gallery ────────────────────────────────────────────────────────────────
async function renderGallery() {
  const el = document.getElementById('gallery-content')
  el.innerHTML = '<div class="loading">Loading projects…</div>'
  try {
    const projects = await loadProjects()
    if (!projects.length) {
      el.innerHTML = '<div class="empty-state"><div class="icon">🚀</div><p>No projects yet. Be the first to submit!</p></div>'
      return
    }
    projects.forEach(p => { projectsMap[p.id] = p })
    el.innerHTML = '<div class="projects-feed">' + projects.map(renderCard).join('') + '</div>'
    setTimeout(updateReadMoreButtons, 150)
  } catch (err) {
    el.innerHTML = '<div class="empty-state"><div class="icon">⚙️</div><p>Could not load projects — check your Supabase config.</p></div>'
  }
}

function renderCard(p) {
  // parse media urls (stored as JSON array or legacy single string)
  let imageUrls = []
  try {
    const parsed = JSON.parse(p.media_url)
    imageUrls = Array.isArray(parsed) ? parsed : [parsed]
  } catch {
    if (p.media_url) imageUrls = [p.media_url]
  }

  const imagesAttr = imageUrls.length ? ` data-images='${JSON.stringify(imageUrls)}'` : ''
  let media = ''
  if (imageUrls.length === 1) {
    media = `<div class="feed-media single"${imagesAttr}><img src="${imageUrls[0]}" data-index="0" class="zoomable" alt="Screenshot" onerror="this.parentElement.style.display='none'"></div>`
  } else if (imageUrls.length > 1) {
    const imgs = imageUrls.map((u, i) => `<img src="${u}" data-index="${i}" class="zoomable" alt="Screenshot" onerror="this.remove()">`).join('')
    media = `<div class="feed-media multi"${imagesAttr}>${imgs}</div>`
  }

  const tools = p.tools
    ? '<div class="tools-list">' + p.tools.split(',').map(t => `<span class="tool-tag">${t.trim()}</span>`).join('') + '</div>'
    : ''

  const rawLink = p.link || ''
  const hrefLink = rawLink && !rawLink.startsWith('http') ? 'https://' + rawLink : rawLink
  const projectLink = hrefLink
    ? `<a href="${hrefLink}" target="_blank" class="project-link">🚀 Access Live App</a>`
    : ''

  let membersHtml = ''
  try {
    const arr = Array.isArray(p.members) ? p.members : JSON.parse(p.members)
    membersHtml = arr.map(m => {
      const initials = m.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
      const linkedinUrl = m.linkedin
        ? (m.linkedin.startsWith('http') ? m.linkedin : 'https://' + m.linkedin)
        : null
      const linkedinLink = linkedinUrl
        ? `<a href="${linkedinUrl}" target="_blank" class="member-link">LinkedIn</a>`
        : ''
      return `<div class="member-chip"><div class="member-avatar">${initials}</div><div class="member-info"><div class="member-name">${m.name}</div><div class="member-links">${linkedinLink}</div></div></div>`
    }).join('')
  } catch (e) {}

  const teamPhoto = p.team_photo_url
    ? `<div class="team-photo-wrap" data-images='["${p.team_photo_url}"]'><img src="${p.team_photo_url}" class="team-photo zoomable" data-index="0" alt="Team photo"></div>`
    : ''

  const cardId = p.id

  const extraFields = [
    p.problem      ? { label: 'Problem',      text: p.problem }       : null,
    p.who_benefits ? { label: 'Who benefits', text: p.who_benefits }  : null,
    p.how_it_works ? { label: 'How it works', text: p.how_it_works }  : null,
  ].filter(Boolean).map(f =>
    `<div class="extra-field"><span class="field-label">${f.label}</span><p>${f.text}</p></div>`
  ).join('')

  const adminBtns = isAdmin ? `
    <div class="admin-btns">
      <button class="edit-btn" onclick="adminEdit('${cardId}')">✏️ Edit</button>
      <button class="delete-btn" onclick="adminDelete('${cardId}', this)">🗑 Delete</button>
    </div>` : ''

  return `<div class="feed-card" data-id="${cardId}">
    ${isAdmin ? '<div class="admin-bar-card">⚙️ Admin mode</div>' : ''}
    <div class="feed-body">
      <h3>${p.name}</h3>
      <div class="desc-wrap">
        <p class="desc collapsed">${p.description}</p>
        <button class="read-more-btn" onclick="toggleDesc(this)">Read more</button>
      </div>
      ${extraFields}
      ${tools}${projectLink}
      ${adminBtns}
    </div>
    ${media}
    <div class="team-section">
      <div class="team-label">Team</div>
      <div class="team-content">
        ${teamPhoto}
        <div class="team-members">${membersHtml}</div>
      </div>
    </div>
  </div>`
}

// ── Event photos (local — host device only) ────────────────────────────────
window.addEventPhotos = function(input) {
  const grid = document.getElementById('event-photos-grid')
  Array.from(input.files).forEach(file => {
    const img = document.createElement('img')
    img.className = 'event-photo'
    img.src = URL.createObjectURL(file)
    grid.appendChild(img)
  })
}

// ── Admin ──────────────────────────────────────────────────────────────────
window.adminDelete = async function(id, btn) {
  if (!confirm('Delete this project? This cannot be undone.')) return
  btn.disabled = true
  btn.textContent = 'Deleting…'
  try {
    await deleteProject(id)
    btn.closest('.feed-card').remove()
  } catch(e) {
    btn.disabled = false
    btn.textContent = '🗑 Delete'
    alert('Delete failed: ' + (e.message || e))
  }
}

let editImages = [] // { url: string, file: File|null }

window.adminEdit = function(id) {
  const p = projectsMap[id]
  if (!p) return
  document.getElementById('em-id').value = p.id
  document.getElementById('em-name').value = p.name || ''
  document.getElementById('em-desc').value = p.description || ''
  document.getElementById('em-problem').value = p.problem || ''
  document.getElementById('em-benefits').value = p.who_benefits || ''
  document.getElementById('em-howit').value = p.how_it_works || ''
  document.getElementById('em-link').value = p.link || ''
  // load existing images
  try {
    const parsed = JSON.parse(p.media_url)
    editImages = (Array.isArray(parsed) ? parsed : [parsed]).map(url => ({ url, file: null }))
  } catch {
    editImages = p.media_url ? [{ url: p.media_url, file: null }] : []
  }
  renderEditImages()
  document.getElementById('edit-modal').classList.add('open')
}

function renderEditImages() {
  const strip = document.getElementById('edit-images-preview')
  if (!strip) return
  strip.innerHTML = editImages.map((img, i) => `
    <div class="preview-thumb">
      <img src="${img.url}" alt="screenshot">
      <button class="remove-img" onclick="removeEditImage(${i})">✕</button>
    </div>`).join('')
}

window.removeEditImage = function(i) {
  editImages.splice(i, 1)
  renderEditImages()
}

window.addEditImages = function(input) {
  Array.from(input.files).forEach(file => {
    editImages.push({ url: URL.createObjectURL(file), file })
  })
  renderEditImages()
  input.value = ''
}

window.closeEditModal = function() {
  document.getElementById('edit-modal').classList.remove('open')
}

window.saveEdit = async function() {
  const id = document.getElementById('em-id').value
  const btn = document.getElementById('em-save')
  btn.disabled = true
  btn.textContent = 'Saving…'
  try {
    // upload any new images
    const finalUrls = []
    for (const img of editImages) {
      if (img.file) {
        btn.textContent = 'Uploading images…'
        const url = await uploadFile(img.file, 'media')
        finalUrls.push(url)
      } else {
        finalUrls.push(img.url)
      }
    }
    const updates = {
      name:          document.getElementById('em-name').value.trim(),
      description:   document.getElementById('em-desc').value.trim(),
      problem:       document.getElementById('em-problem').value.trim(),
      who_benefits:  document.getElementById('em-benefits').value.trim(),
      how_it_works:  document.getElementById('em-howit').value.trim(),
      link:          document.getElementById('em-link').value.trim(),
      media_url:     JSON.stringify(finalUrls),
      media_type:    'image',
    }
    btn.textContent = 'Saving…'
    await updateProject(id, updates)
    closeEditModal()
    renderGallery()
  } catch(e) {
    console.error(e)
    alert('Save failed: ' + (e.message || e))
    btn.disabled = false
    btn.textContent = 'Save Changes'
  }
}

// ── Read more ──────────────────────────────────────────────────────────────
window.toggleDesc = function(btn) {
  const desc = btn.previousElementSibling
  const expanded = desc.classList.toggle('collapsed')
  btn.textContent = expanded ? 'Read more' : 'Show less'
}

// Hide "Read more" button when text is short enough not to clamp
function updateReadMoreButtons() {
  document.querySelectorAll('.desc-wrap').forEach(wrap => {
    const desc = wrap.querySelector('.desc')
    const btn = wrap.querySelector('.read-more-btn')
    desc.classList.remove('collapsed')
    const fullH = desc.scrollHeight
    desc.classList.add('collapsed')
    btn.style.display = fullH > desc.clientHeight + 4 ? '' : 'none'
  })
}

// ── Lightbox ───────────────────────────────────────────────────────────────
let lbImages = []
let lbIndex = 0

document.addEventListener('click', e => {
  if (e.target.classList.contains('zoomable')) openLightbox(e.target)
})

window.openLightbox = function(img) {
  const container = img.closest('[data-images]')
  lbImages = container ? JSON.parse(container.dataset.images) : [img.src]
  lbIndex = parseInt(img.dataset.index || '0')
  showLbImage()
  document.getElementById('lightbox').classList.add('open')
  document.addEventListener('keydown', lbKeyHandler)
}

window.closeLightbox = function() {
  document.getElementById('lightbox').classList.remove('open')
  document.removeEventListener('keydown', lbKeyHandler)
}

window.lbNav = function(dir, e) {
  e.stopPropagation()
  lbIndex = (lbIndex + dir + lbImages.length) % lbImages.length
  showLbImage()
}

function showLbImage() {
  document.getElementById('lb-img').src = lbImages[lbIndex]
  document.getElementById('lb-counter').textContent = lbImages.length > 1
    ? `${lbIndex + 1} / ${lbImages.length}` : ''
  const multi = lbImages.length > 1
  document.getElementById('lb-prev').style.display = multi ? '' : 'none'
  document.getElementById('lb-next').style.display = multi ? '' : 'none'
}

function lbKeyHandler(e) {
  if (e.key === 'Escape') closeLightbox()
  if (e.key === 'ArrowLeft') { lbIndex = (lbIndex - 1 + lbImages.length) % lbImages.length; showLbImage() }
  if (e.key === 'ArrowRight') { lbIndex = (lbIndex + 1) % lbImages.length; showLbImage() }
}

// ── Char counters ──────────────────────────────────────────────────────────
window.updateCount = function(inputId, countId, max) {
  const len = document.getElementById(inputId).value.length
  const el = document.getElementById(countId)
  el.textContent = `${len}/${max}`
  el.classList.toggle('near-limit', len > max * 0.85)
}

// ── Init ───────────────────────────────────────────────────────────────────
renderGallery()
