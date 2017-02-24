$(function() {

	var navItems = $(".navbar a");
	var currentPath = window.location.pathname;

	if(currentPath.indexOf("service-docs") > 0) {
		navItems.eq(0).addClass("active");
	}

	if(currentPath.indexOf("api-docs") > 0) {
		navItems.eq(1).addClass("active");
	}

});