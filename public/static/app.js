window.createNote = async function () {
	try {
		const res = await fetch('/api/notes', {
			method: 'POST',
			body: JSON.stringify({ title: 'New Note', content: '' })
		});
		if (res.ok) {
			const note = await res.json();
			window.navigate('/notes/' + note.id);
		}
	} catch (e) {
		console.error('Failed to create note:', e);
	}
};

window.saveNote = async function (event) {
	try {
		const editor = event.target.closest('.editor');
		const id = editor.dataset.id;
		const title = editor.querySelector('#note-title').value;
		const content = editor.querySelector('#note-content').value;

		const res = await fetch('/api/notes/' + id, {
			method: 'PUT',
			body: JSON.stringify({ title, content })
		});

		if (res.ok) {
			// Refresh to update sidebar
			window.navigate(window.location.href);
		}
	} catch (e) {
		console.error('Failed to save note:', e);
	}
};

window.deleteNote = async function (event) {
	try {
		const editor = event.target.closest('.editor');
		const id = editor.dataset.id;

		if (confirm('Are you sure you want to delete this note?')) {
			const res = await fetch('/api/notes/' + id, { method: 'DELETE' });
			if (res.ok) {
				window.navigate('/notes');
			}
		}
	} catch (e) {
		console.error('Failed to delete note:', e);
	}
};
