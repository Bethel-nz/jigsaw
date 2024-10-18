document.addEventListener('DOMContentLoaded', () => {
	const screenshots = document.querySelectorAll('.screenshots img');

	screenshots.forEach(screenshot => {
		screenshot.addEventListener('click', () => {
			screenshot.classList.toggle('enlarged');
		});
	});
});
