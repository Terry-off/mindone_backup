(function($) {
    $.preloader = {
        init : function(){
            if($("#doz-preloader").length==0){
                var html = "";
                html += "<div class=\"doz-spinner-back\" id=\"doz-preloader\" style='display: none'>";
                html += "<div class=\"doz-spinner-sub-back\">";
                html += "<div class=\"doz-spinners\">";
                html += "<div class=\"row\">";
                html += "<div class=\"doz-spinner doz-spinner-blink\"></div>";
                html += "</div>";
                html += "</div>";
                html += "</div>";
                html += "</div>";
                $("body").append(html);
            }
        },
        show : function(){
            this.init();
            $("#doz-preloader").show();

        },
        hide : function(){
            $("#doz-preloader").hide();
        }
    }
})(jQuery);