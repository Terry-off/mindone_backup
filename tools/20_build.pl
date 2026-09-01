#!/usr/bin/perl
# 20_build.pl — 원본 HTML → 백업 사이트 페이지 빌드 (바이트 단위, DOM 재직렬화 없음)
use strict; use warnings;
use File::Basename qw(dirname);
use File::Path qw(make_path);

my $ROOT = dirname(dirname(__FILE__));
my $RAW  = "$ROOT/_workdir/raw/pages";
my $MAP  = "$ROOT/_workdir/asset_map.tsv";

# ---------- 페이지 테이블 ----------
# key => { out, board(렌더 대상 보드 id), partners, home }
my @KEYS = qw(intro_mindone front_tooth implant price 23 37 39 40 41 42 43 79 82 83 84 85 86 104 105 106 107 108 109 110 111 112 113 114 115 116 117 118 119 121);
my %BOARD_OF = (map({$_=>$_} qw(86 104 105 106 107 108 109 110 111 112 113 114 115 116 117 118 119 121)), 82=>105, 84=>86, 85=>112);
my %PAGES = ('__home' => { out=>'index.html', P=>'', home=>1 });
$PAGES{$_} = { out=>"$_/index.html", P=>'../' } for @KEYS;
$PAGES{41}{partners} = 1;
$PAGES{$_}{board} = $BOARD_OF{$_} for keys %BOARD_OF;

# ---------- 에셋 맵 로드 ----------
my (%map, %imap);
open my $mf, '<', $MAP or die "asset_map.tsv 없음: $MAP";
while (<$mf>) { chomp; my ($u,$l) = split /\t/; next unless $u && $l;
  if ($u =~ /cdninstagram\.com/) { $imap{$u} = $l; (my $d = $u) =~ s/&amp;/&/g; $imap{$d} = $l; }
  else { $map{$u} = $l } }
close $mf;
print "asset map: ".(scalar keys %map)." imweb + ".(scalar keys %imap)." insta\n";

# ---------- 제거 목록 ----------
my @STRIP_SRC = ('wcs.naver.net','static.imweb.me/analytics-sdk','crm-onsite.imweb.me',
  'static-cdn.crm.imweb.me','oms-shop-bridge','/_/oms-customer-front-office','/_/fo-shopping/',
  't1.kakaocdn.net','/js/init_datadog_rum.js','/js/imweb_external_sdk.js','/js/brandscope.js');
my @STRIP_LINK = ('/_/fo-shopping/','oms-customer-front-office');
my @STRIP_INLINE = ('deploy_strategy.js','magnet-shell.js','magnet/magnet.js','IMIO-7835',
  'load_change_password.cm','wcs_add','wcs.naver');

my $keys_re = join '|', map { quotemeta } sort { length($b) <=> length($a) } @KEYS;

my $total_leftover = 0;
for my $key (sort keys %PAGES) {
  my $pg = $PAGES{$key};
  my $P = $pg->{P};
  my $src = "$RAW/$key.html";
  open my $fh, '<:raw', $src or die "raw 없음: $src";
  local $/; my $h = <$fh>; close $fh;
  my %n;

  # 1) script src 제거
  for my $m (@STRIP_SRC) {
    $n{strip_js} += ($h =~ s{<script[^>]*\ssrc=['"][^'"]*\Q$m\E[^'"]*['"][^>]*>\s*</script>}{}g);
  }
  # 2) link 제거 (fo-shopping/oms preload·style, canonical, alternate)
  for my $m (@STRIP_LINK) {
    $n{strip_link} += ($h =~ s{<link[^>]*\Q$m\E[^>]*>}{}g);
  }
  $n{strip_link} += ($h =~ s{<link[^>]*rel=['"](?:canonical|alternate)['"][^>]*>}{}g);
  # 3) 인라인 스크립트 제거: JSON-LD 전부 + 마커 포함 블록
  $n{strip_ld} += ($h =~ s{<script type=["']application/ld\+json["']>.*?</script>}{}gs);
  for my $m (@STRIP_INLINE) {
    $n{strip_inline} += ($h =~ s{<script(?![^>]*\ssrc=)[^>]*>(?:(?!</script>).)*?\Q$m\E(?:(?!</script>).)*?</script>}{}gs);
  }

  # 4a) 자기 도메인 절대URL → 루트상대
  $n{selfdom} += ($h =~ s{https?://minddent\.imweb\.me}{}g);

  # 4b) imweb CDN URL → 로컬 (미등록 URL은 유지 → 검증에서 검출)
  $n{cdn} += ($h =~ s{(https?://(?:vendor-cdn|cdn|cdn-optimized)\.imweb\.me/[^"'()<>\s\\&]+?)(\?[0-9]+)?(?=["'()<>\s\\&])}{
      exists $map{$1} ? $P.$map{$1} : $1.($2//'') }ge);

  # 4b2) 인라인 JSON 설정 속 이스케이프 URL (https:\/\/cdn.imweb.me\/...)
  $n{cdnesc} += ($h =~ s{(https?:\\/\\/(?:vendor-cdn|cdn|cdn-optimized)\.imweb\.me\\/[^"'()<>\s&]+?)(\?[0-9]+)?(?=["'()<>\s&])}{
      my ($u,$q)=($1,$2); (my $uu=$u) =~ s{\\/}{/}g;
      exists $map{$uu} ? $P.$map{$uu} : $u.($q//'') }ge);

  # 4c) 인스타그램 정확 매핑
  $n{insta} += ($h =~ s{(https://[a-z0-9.-]*cdninstagram\.com/[^"'<>\s)]+)}{
      exists $imap{$1} ? $P.$imap{$1} : $1 }ge);

  # 4d) 사이트 상대 에셋
  $n{sitejs} += ($h =~ s{(src=['"])/js/}{$1${P}assets/site/js/}g);
  $n{sitejs} += ($h =~ s{(href=['"])/css/custom\.cm[^'"]*}{$1${P}assets/site/css/custom.css}g);

  # 4e) 내부 페이지 링크 (href/data-url)
  $n{ilink} += ($h =~ s{((?:href|data-url)=(['"]))/($keys_re)/?(?=[?"'#])}{$1.$P.$3.'/'}ge);
  $n{ilink} += ($h =~ s{((?:href|data-url)=(['"]))/index/?(?=["'?#])}{$1.($P eq '' ? './' : $P)}ge);
  $n{ilink} += ($h =~ s{((?:href|data-url)=(['"]))/(?=\2)}{$1.($P eq '' ? './' : $P)}ge);

  # 5) 폰트 변수화 (PC=Noto Sans KR / 모바일=Pretendard)
  $n{font} += ($h =~ s{font-family: Roboto,Noto Sans Korean, sans-serif;}{font-family: Roboto,var(--kr-font,Noto Sans Korean), sans-serif;}g);

  # 6) head 주입: noindex + 스타일 + 스텁
  my $head_inj = qq{\n<meta name="robots" content="noindex, nofollow">\n}
    . qq{<style id="backup-style">:root{--kr-font:'Noto Sans Korean';}\@media (max-width:767px){:root{--kr-font:'Pretendard';}}\n}
    . qq{.alarm-toggle,.notification-canvas,.alarm-pane,.alarm-setting,a[href^='/login'],a[href^='/logout'],a[href\*='logout.cm'],a[href\*='login?back_url']{display:none!important}\n}
    . qq{.popup-banner-wrap{display:none!important}</style>\n}
    . qq{<script src='${P}backup/js/stubs.js'></script>\n};
  $n{head} += ($h =~ s{(<head[^>]*>)}{$1$head_inj}s);

  # 7) IS_MOBILE 런타임 보정 (_d 전개 직후)
  my $dev_inj = qq{<script>try{window.IS_MOBILE=window.matchMedia('(max-width:767px)').matches;}catch(e){}</script>};
  $n{dev} += ($h =~ s{(window\.USE_OMS = true;\s*\}\)\(\);\s*</script>)}{$1$dev_inj}s);

  # 8) body 끝 주입: 페이지 컨텍스트 + 데이터 + 런타임
  my $board = $pg->{board} // '';
  my $binj = qq{\n<script>window.__P='$P';window.__PAGE='$key';window.__BOARD='$board';</script>\n}
    . qq{<script src='${P}data/config.js'></script>\n}
    . qq{<script src='${P}data/overrides.js'></script>\n}
    . qq{<script src='${P}backup/js/overrides.js'></script>\n}
    . qq{<script src='${P}backup/js/fixups.js'></script>\n};
  $binj .= qq{<script src='${P}data/popups.js'></script>\n<script src='${P}backup/js/popup.js'></script>\n} if $pg->{home};
  $binj .= qq{<script src='${P}data/boards/$board.js'></script>\n<script src='${P}backup/js/boards.js'></script>\n} if $board;
  $binj .= qq{<script src='${P}data/partners.js'></script>\n<script src='${P}backup/js/partners.js'></script>\n<script src='${P}backup/js/inquiry.js'></script>\n} if $pg->{partners};
  $n{body} += ($h =~ s{(</body>)}{$binj$1}s);

  # 9) base 태그 제거(있다면)
  $h =~ s{<base [^>]*>}{}g;

  # 저장
  my $out = "$ROOT/$pg->{out}";
  make_path(dirname($out));
  open my $of, '>:raw', $out or die $!;
  print $of $h; close $of;

  my $leftover = () = $h =~ m{imweb\.me}g;
  my $insta_left = () = $h =~ m{cdninstagram\.com}g;
  $total_leftover += $leftover;
  printf "%-15s cdn:%-4d insta:%-3d ilink:%-4d font:%-3d head:%d dev:%d body:%d | 잔여 imweb:%d insta:%d\n",
    $key, $n{cdn}//0, $n{insta}//0, $n{ilink}//0, $n{font}//0, $n{head}//0, $n{dev}//0, $n{body}//0, $leftover, $insta_left;
}
print "TOTAL leftover imweb refs: $total_leftover\n";