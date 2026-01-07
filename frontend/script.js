// Download images as zip
document.getElementById('downloadBtn').addEventListener('click', async function() {
  if (!lastStoryResult || !lastStoryResult.imagePaths || lastStoryResult.imagePaths.length === 0) return;
  try {
    const response = await fetch('https://scribber.onrender.com/api/download-images', {
      method: 'GET'
    });
    if (!response.ok) {
      const error = await response.json();
      alert('Failed to download: ' + (error.error || 'Unknown error'));
      return;
    }
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'story_images.zip';
    document.body.appendChild(link);
    link.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(link);
  } catch (err) {
    alert('Failed to download: ' + err.message);
  }
});

let lastStoryData = null;
let lastStoryResult = null;

document.getElementById('storyForm').addEventListener('submit', async function(e) {
  e.preventDefault();
  document.getElementById('loading').style.display = 'block';
  document.getElementById('result').innerHTML = '';
  document.getElementById('styleControls').style.display = 'none';

  const formData = new FormData(e.target);
  const data = Object.fromEntries(formData.entries());

  try {
    const response = await fetch('https://scribber.onrender.com/api/story', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const result = await response.json();
    document.getElementById('loading').style.display = 'none';
    if (result.error) {
      document.getElementById('result').innerHTML = `<div style='color:red;'>${result.error}</div>`;
      return;
    }
    lastStoryData = data;
    lastStoryResult = result;
    renderStoryWithImages(result);
    document.getElementById('styleControls').style.display = 'block';
  } catch (err) {
    document.getElementById('loading').style.display = 'none';
    document.getElementById('result').innerHTML = `<div style='color:red;'>${err.message}</div>`;
  }
});

function renderStoryWithImages(result, styleOptions) {
  const cacheBuster = styleOptions ? `?t=${Date.now()}` : '';
  let html = '';
  // Render all images returned by backend, including title page (story_page_0.png or story_page_1.png)
  if (result.imagePaths && result.imagePaths.length > 0) {
    result.imagePaths.forEach((imgPath, i) => {
      // Use backend-provided path if available, else fallback to /images/story_page_X.png
      let imgSrc = imgPath.startsWith('/images/') ? imgPath : `/images/story_page_${i}.png`;
      imgSrc += cacheBuster;
      html += `<img src="${imgSrc}" alt="Story page ${i} image" style="width: 100%; max-width: 540px; aspect-ratio: 1 / 1; object-fit: contain; background: #eee; margin-bottom: 24px;" />`;
    });
  }
  document.getElementById('result').innerHTML = html;
}

document.getElementById('rerenderBtn').addEventListener('click', async function() {
  if (!lastStoryResult) return;
  // Get style options
  const fontFamily = document.getElementById('fontFamily').value;
  const fontColor = document.getElementById('fontColor').value;
  const backgroundColor = document.getElementById('backgroundColor').value;

  // Call new API endpoint to rerender images with style options
  document.getElementById('loading').style.display = 'block';
  try {
    const response = await fetch('https://scribber.onrender.com/api/rerender-images', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: lastStoryResult.title,
        pages: lastStoryResult.pages,
        fontFamily,
        fontColor,
        backgroundColor
      })
    });
    const result = await response.json();
    document.getElementById('loading').style.display = 'none';
    if (result.error) {
      document.getElementById('result').innerHTML = `<div style='color:red;'>${result.error}</div>`;
      return;
    }
    // Use the same story, but new image paths
    lastStoryResult.imagePaths = result.imagePaths;
    renderStoryWithImages(lastStoryResult, { fontFamily, fontColor, backgroundColor });
  } catch (err) {
    document.getElementById('loading').style.display = 'none';
    document.getElementById('result').innerHTML = `<div style='color:red;'>${err.message}</div>`;
  }
});
