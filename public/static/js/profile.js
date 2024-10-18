document.addEventListener('DOMContentLoaded', () => {
	const profileImage = document.querySelector('.profile-image');

	if (profileImage) {
		profileImage.addEventListener('click', () => {
			profileImage.style.transform = 'rotate(360deg)';
			setTimeout(() => {
				profileImage.style.transform = 'rotate(0deg)';
			}, 1000);
		});
	}

	const projects = document.querySelectorAll('.project');

	projects.forEach(project => {
		project.addEventListener('mouseenter', () => {
			project.style.backgroundColor = '#bfdbfe';
		});

		project.addEventListener('mouseleave', () => {
			project.style.backgroundColor = '#ebf8ff';
		});
	});
});
