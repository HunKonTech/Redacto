<script lang="ts">
	let { size = 26, gradId = 'pg-logo' } = $props<{
		size?: number;
		gradId?: string;
	}>();

	let bgId = $derived(`${gradId}-bg`);
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 128 128"
	class="pg-logo"
	role="img"
	aria-label="Redacto"
>
	<defs>
		<linearGradient id={bgId} x1="0" y1="0" x2="1" y2="1">
			<stop offset="0" stop-color="#14B8A6" />
			<stop offset="1" stop-color="#4F46E5" />
		</linearGradient>
	</defs>
	<rect x="4" y="4" width="120" height="120" rx="28" fill={`url(#${bgId})`} />
	<rect x="24" y="30" width="30" height="14" rx="7" fill="#FFFFFF" />
	<rect x="60" y="28" width="44" height="18" rx="5" fill="#0B1220" />
	<rect x="24" y="55" width="54" height="18" rx="5" fill="#0B1220" />
	<rect x="84" y="57" width="20" height="14" rx="7" fill="#FFFFFF" />
	<rect x="24" y="84" width="44" height="14" rx="7" fill="#FFFFFF" />
	<rect x="74" y="82" width="30" height="18" rx="5" fill="#0B1220" />
</svg>

<style>
	.pg-logo {
		display: block;
		width: auto;
		height: 100%;
		max-width: 100%;
		max-height: 100%;
	}
</style>
