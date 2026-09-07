<script module lang="ts">
	import file from "pixelarticons/svg/file.svg?url";
	import plus from "pixelarticons/svg/plus.svg?url";
	import sliders from "pixelarticons/svg/settings-cog.svg?url";
	import info from "pixelarticons/svg/info-box.svg?url";
	import moon from "pixelarticons/svg/moon.svg?url";
	import sun from "pixelarticons/svg/sun.svg?url";
	import arrow from "pixelarticons/svg/arrow-right.svg?url";
	import check from "pixelarticons/svg/check.svg?url";
	import download from "pixelarticons/svg/download.svg?url";
	import close from "pixelarticons/svg/close.svg?url";
	import server from "pixelarticons/svg/server.svg?url";
	import folder from "pixelarticons/svg/folder.svg?url";
	import music from "pixelarticons/svg/music.svg?url";
	import video from "pixelarticons/svg/video.svg?url";
	import chevron from "pixelarticons/svg/chevron-down.svg?url";
	import loader from "pixelarticons/svg/loader.svg?url";
	import archive from "pixelarticons/svg/archive.svg?url";
	import monitor from "pixelarticons/svg/monitor.svg?url";
	import picture from "pixelarticons/svg/image.svg?url";
	import globe from "pixelarticons/svg/globe.svg?url";
	import trash from "pixelarticons/svg/trash.svg?url";
	import leaf from "pixelarticons/svg/leaf.svg?url";
	import lock from "pixelarticons/svg/lock.svg?url";
	import shield from "pixelarticons/svg/shield.svg?url";
	import zap from "pixelarticons/svg/zap.svg?url";
	import infinity from "pixelarticons/svg/infinity.svg?url";
	import gem from "pixelarticons/svg/diamond-gem.svg?url";
	import box from "pixelarticons/svg/box.svg?url";
	import palette from "pixelarticons/svg/colors-swatch.svg?url";
	import heart from "pixelarticons/svg/heart.svg?url";
	import question from "pixelarticons/svg/circle-question.svg?url";
	import link from "pixelarticons/svg/link.svg?url";
	import mail from "pixelarticons/svg/mail.svg?url";
	import message from "pixelarticons/svg/message.svg?url";
	import github from "pixelarticons/svg/github.svg?url";
	import coins from "pixelarticons/svg/coins.svg?url";
	import copy from "pixelarticons/svg/copy.svg?url";
	import play from "pixelarticons/svg/play.svg?url";
	import pause from "pixelarticons/svg/pause.svg?url";
	import reload from "pixelarticons/svg/reload.svg?url";
	import upload from "pixelarticons/svg/upload.svg?url";
	import cancel from "pixelarticons/svg/cancel.svg?url";
	import warning from "pixelarticons/svg/warning-diamond.svg?url";
	const icons = {
		shield,
		zap,
		infinity,
		gem,
		box,
		palette,
		heart,
		question,
		link,
		mail,
		message,
		github,
		coins,
		copy,
		play,
		pause,
		reload,
		upload,
		cancel,
		warning,

		leaf,
		lock,
		info,
		file,
		plus,
		sliders,
		moon,
		sun,
		arrow,
		check,
		download,
		close,
		server,
		folder,
		music,
		video,
		chevron,
		loader,
		archive,
		monitor,
		picture,
		globe,
		trash,
	};
	export type PixelIconName = keyof typeof icons;
</script>

<script lang="ts">
	let {
		name,
		size = 24,
		class: className = "",
	}: { name: PixelIconName; size?: number; class?: string } = $props();
</script>

<span
	class="pixel-icon {className}"
	aria-hidden="true"
	style:--icon={`url("${icons[name].replace(/"/g, "%22")}")`}
	style:--icon-size={`${size}px`}
></span>
