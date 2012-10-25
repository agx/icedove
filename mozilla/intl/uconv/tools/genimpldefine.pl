#!/user/local/bin/perl
# -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
#
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

$name = "ucvlatin";
$dir = "./";

sub printnpl()
{
$npl = <<END_OF_NPL;
/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
END_OF_NPL
print   $npl;
}

sub finddefine()
{
  my($classname, $definename) = (@_);
  $cmd = 'egrep ' . $classname .  ' ' . $dir . '*.h ' . $dir . '*.cpp | egrep "public" | egrep -v "Support[.]"' . '&> /dev/null';
  if( system($cmd)) {
    print   "\/\/ ";
  }
  print   "#define " . $definename . "\n";
}



&printnpl();
print   "\n";
print   "#ifndef " . $name . "config_h__\n";
print   "#define " . $name . "config_h__\n";
print   "\n";
print   "\/* This file is generated by running mozilla/intl/uconv/tools/genimpldefine.pl on unix */\n";

&finddefine( "nsBasicDecoderSupport", "IMPL_NSBASICDECODER");
&finddefine( "nsBufferDecoderSupport", "IMPL_NSBUFFERDECODER");
&finddefine( "nsTableDecoderSupport", "IMPL_NSTABLEDECODER");
&finddefine( "nsMultiTableDecoderSupport", "IMPL_NSMULTITABLEDECODER");
&finddefine( "nsOneByteDecoderSupport", "IMPL_NSONEBYTEDECODER");
&finddefine( "nsBasicEncoder", "IMPL_NSBASICENCODER");
&finddefine( "nsEncoderSupport", "IMPL_NSENCODER");
&finddefine( "nsTableEncoderSupport", "IMPL_NSTABLEENCODER");
&finddefine( "nsMultiTableEncoderSupport", "IMPL_NSMULTITABLEENCODER");
print   "\n";
print   "#include \"" . $name . "rules.h\"\n";
print   "\n";
print   "#endif \/*" . $name . "config_h__ *\/\n";
