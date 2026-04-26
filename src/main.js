import './style.css'
import { uploadFile, loadProjects, insertProject } from './supabase.js'

// ── State ──────────────────────────────────────────────────────────────────
let uploadedMediaFiles = []
let uploadedTeamPhoto = null
let selectedTools = []

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
    await insertProject({ name, description: desc, link, tools: selectedTools.join(', '), media_url: mediaUrl, media_type: mediaType, team_photo_url: teamPhotoUrl, members })

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
    el.innerHTML = '<div class="projects-feed">' + projects.map(renderCard).join('') + '</div>'
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

  let media = ''
  if (imageUrls.length === 1) {
    media = `<div class="feed-media single"><img src="${imageUrls[0]}" alt="Screenshot" onerror="this.parentElement.style.display='none'"></div>`
  } else if (imageUrls.length > 1) {
    media = `<div class="feed-media multi">${imageUrls.map(u => `<img src="${u}" alt="Screenshot" onerror="this.remove()">`).join('')}</div>`
  }

  const tools = p.tools
    ? '<div class="tools-list">' + p.tools.split(',').map(t => `<span class="tool-tag">${t.trim()}</span>`).join('') + '</div>'
    : ''

  const projectLink = p.link
    ? `<a href="${p.link}" target="_blank" class="project-link">🚀 Access Live App</a>`
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

  const teamPhoto = p.team_photo_url ? `<img src="${p.team_photo_url}" class="team-photo" alt="Team photo">` : ''

  return `<div class="feed-card">
    <div class="feed-body">
      <h3>${p.name}</h3>
      <p class="desc">${p.description}</p>
      ${tools}${projectLink}
    </div>
    ${media}
    <div class="team-section">${teamPhoto}${membersHtml}</div>
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

// ── Init ───────────────────────────────────────────────────────────────────
renderGallery()
