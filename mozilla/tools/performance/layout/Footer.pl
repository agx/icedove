##########################################################################################
#
# ***** BEGIN LICENSE BLOCK *****
# Version: MPL 1.1/GPL 2.0/LGPL 2.1
#
# The contents of this file are subject to the Mozilla Public License Version
# 1.1 (the "License"); you may not use this file except in compliance with
# the License. You may obtain a copy of the License at
# http://www.mozilla.org/MPL/
#
# Software distributed under the License is distributed on an "AS IS" basis,
# WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
# for the specific language governing rights and limitations under the
# License.
#
# The Original Code is mozilla.org code.
#
# The Initial Developer of the Original Code is
# Netscape Communications Corporation.
# Portions created by the Initial Developer are Copyright (C) 1998
# the Initial Developer. All Rights Reserved.
#
# Contributor(s):
#   2/10/00 attinasi
#
# Alternatively, the contents of this file may be used under the terms of
# either the GNU General Public License Version 2 or later (the "GPL"), or
# the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
# in which case the provisions of the GPL or the LGPL are applicable instead
# of those above. If you wish to allow use of your version of this file only
# under the terms of either the GPL or the LGPL, and not to allow others to
# use your version of this file under the terms of the MPL, indicate your
# decision by deleting the provisions above and replace them with the notice
# and other provisions required by the GPL or the LGPL. If you do not delete
# the provisions above, a recipient may use your version of this file under
# the terms of any one of the MPL, the GPL or the LGPL.
#
# ***** END LICENSE BLOCK *****


#------------------------------------------------------------------------------
sub debug_print {
  foreach $str (@_){
#    print( $str );
  }
}

#------------------------------------------------------------------------------
@ARGV;
$buildRoot = $ARGV[0];
#$buildIDFile = '< '.$buildRoot.'\bin\chrome\locales\en-US\navigator\locale\navigator.dtd';
$PullID = $ARGV[1];

#------------------------------------------------------------------------------
# Variables for the values in the AVERAGES.TXT file
# NOTE this is the order they appear in the file
$Num_Entries = 0;
$Avg_Parse_Time = 0;
$Avg_Parse_Time_Percentage = 0;
$Avg_Content_Time = 0;
$Avg_Content_Time_Percentage = 0;
$Avg_Frame_Time = 0;
$Avg_Frame_Time_Percentage = 0;
$Avg_Style_Time = 0;
$Avg_Style_Time_Percentage = 0;
$Avg_Reflow_Time = 0;
$Avg_Reflow_Time_Percentage = 0;
$Avg_TotalLayout_Time = 0;
$Avg_TotalLayout_Time_Percentage = 0;
$Avg_TotalPageLoad_Time = 0;
$count = 0;
@List;
@temp;

#------------------------------------------------------------------------------
# Get the BuildID
#open (XUL_FILE, $buildIDFile) or die "Unable to open BuildID file $buildIDFile (footer.pl)";
#$BuildNo = "";
#$LineList;
#while (<XUL_FILE>)
#{
#  $ThisLine = $_;
#  chop ($ThisLine);
#  if (/Build ID/){
#    @LineList = split (/\"/, $ThisLine);
#    $BuildNo = $LineList[1];
#  }
#}
#$BuildNo =~ s/"//g;
#$BuildNo =~ s/[>]//g;
#close (XUL_FILE);
#debug_print ($BuildNo);

#------------------------------------------------------------------------------
# Process the averages file: get the number of entries 
# and divide out the accumulated values
#
open (AVERAGE, "< Average.txt") or die "Unable to open average.txt (Footer.pl)";
while (<AVERAGE>)
{
  $ThisLine = $_;
  chop ($ThisLine);

  if( /Num Entries:/ ){
    @list = split( / /, $ThisLine );
    $Num_Entries = $list[2];
    debug_print( "Num Entries in Footer: $Num_Entries\n" );
  } else {
    if( $Num_Entries != 0 ){
      @temp = split (/ /, $ThisLine);
      $List[$count] = $temp[2];
      $List[$count] = $List[$count] / $Num_Entries;
      debug_print( "Averaged entry: $temp[2] / $Num_Entries = $List[$count]\n" );
      $count ++;
    } else {
      print( "Number of entries is 0: this is either a bad file or the universe has imploded\n" );
      die;
    }
  }
}
close (AVERAGE);

#------------------------------------------------------------------------------
# Now put the values to the table
#
open (TABLE_FILE, ">>table.html") or die "Cannot open the file table.html";

print (TABLE_FILE "<tr>");
print (TABLE_FILE "<td BGCOLOR='#CCFFFF'>");
print (TABLE_FILE "<center><b><font size =+1>Average</font></b></center>");
print (TABLE_FILE "</td>");

$Avg_Parse_Time = @List [0];
debug_print ("$Avg_Parse_Time\n");
print (TABLE_FILE "<td BGCOLOR='#CCFFFF'>");
printf (TABLE_FILE "<center>%4.2f</center></B></FONT>",$Avg_Parse_Time);
print (TABLE_FILE "</td>");

$Avg_Parse_Time_Percentage = @List [1];
debug_print ("$Avg_Parse_Time_Percentage\n");
print (TABLE_FILE "<td BGCOLOR='#CCFFFF'>");
printf (TABLE_FILE "<center>%4.2f</center></B></FONT>",$Avg_Parse_Time_Percentage);
print (TABLE_FILE "</td>");

$Avg_Content_Time = @List [2];
debug_print ("$Avg_Content_Time\n");
print (TABLE_FILE "<td BGCOLOR='#CCFFFF'>");
printf (TABLE_FILE "<center>%4.2f</center></B></FONT>",$Avg_Content_Time);
print (TABLE_FILE "</td>");

$Avg_Content_Time_Percentage = @List [3];
debug_print ("$Avg_Content_Time_Percentage\n");
print (TABLE_FILE "<td BGCOLOR='#CCFFFF'>");
printf (TABLE_FILE "<center>%4.2f</center></B></FONT>",$Avg_Content_Time_Percentage);
print (TABLE_FILE "</td>");

$Avg_Frame_Time = @List [4];
debug_print ("$Avg_Frame_Time\n");
print (TABLE_FILE "<td BGCOLOR='#CCFFFF'>");
printf (TABLE_FILE "<center>%4.2f</center></B></FONT>",$Avg_Frame_Time);
print (TABLE_FILE "</td>");

$Avg_Frame_Time_Percentage = @List [5];
debug_print ("$Avg_Frame_Time_Percentage\n");
print (TABLE_FILE "<td BGCOLOR='#CCFFFF'>");
printf (TABLE_FILE "<center>%4.2f</center></B></FONT>",$Avg_Frame_Time_Percentage);
print (TABLE_FILE "</td>");

$Avg_Style_Time = @List [6];
debug_print ("$Avg_Style_Time\n");
print (TABLE_FILE "<td BGCOLOR='#CCFFFF'>");
printf (TABLE_FILE "<center>%4.2f</center></B></FONT>",$Avg_Style_Time);
print (TABLE_FILE "</td>");

$Avg_Style_Time_Percentage = @List [7];
debug_print ("$Avg_Style_Time_Percentage\n");
print (TABLE_FILE "<td BGCOLOR='#CCFFFF'>");
printf (TABLE_FILE "<center>%4.2f</center></B></FONT>",$Avg_Style_Time_Percentage);
print (TABLE_FILE "</td>");

$Avg_Reflow_Time = @List [8];
debug_print ("$Avg_Reflow_Time\n");
print (TABLE_FILE "<td BGCOLOR='#CCFFFF'>");
printf (TABLE_FILE "<center>%4.2f</center></B></FONT>",$Avg_Reflow_Time);
print (TABLE_FILE "</td>");

$Avg_Reflow_Time_Percentage = @List [9];
debug_print ("$Avg_Reflow_Time_Percentage\n");
print (TABLE_FILE "<td BGCOLOR='#CCFFFF'>");
printf (TABLE_FILE "<center>%4.2f</center></B></FONT>",$Avg_Reflow_Time_Percentage);
print (TABLE_FILE "</td>");

$Avg_TotalLayout_Time = @List [10];
debug_print ("$Avg_TotalLayout_Time\n");
print (TABLE_FILE "<td BGCOLOR='#CCFFFF'>");
printf (TABLE_FILE "<center>%4.2f</center></B></FONT>",$Avg_TotalLayout_Time);
print (TABLE_FILE "</td>");

$Avg_TotalLayout_Time_Percentage = @List [11];
debug_print ("$Avg_TotalLayout_Time_Percentage\n");
print (TABLE_FILE "<td BGCOLOR='#CCFFFF'>");
printf (TABLE_FILE "<center>%4.2f</center></B></FONT>",$Avg_TotalLayout_Time_Percentage);
print (TABLE_FILE "</td>");

$Avg_TotalPageLoad_Time = @List [12];
debug_print ("$Avg_TotalPageLoad_Time\n");
print (TABLE_FILE "<td BGCOLOR='#CCFFFF'>");
printf (TABLE_FILE "<center>%4.2f</center></B></FONT>",$Avg_TotalPageLoad_Time);
print (TABLE_FILE "</td>");

print (TABLE_FILE "</tr>");
print (TABLE_FILE "</table>");
print (TABLE_FILE "</html>");

close (TABLE_FILE);

#------------------------------------------------------------------------------
# Now create the History file entries
# FORMAT: "pullID, buildID, ParseTime, ParsePer, ContentTime, ContentPer, FrameTime, FramePer, 
#          StyleTime, StylePer, ReflowTime, ReflowPer, LayoutTime, LayoutPer, TotalTime"
#
open (HISTORY, ">> History.txt" ) or die "History file could not be opened: no history will be written\n";
print(HISTORY "$PullID,$BuildNo,$Avg_Parse_Time,$Avg_Parse_Time_Percentage,$Avg_Content_Time,$Avg_Content_Time_Percentage,");
print(HISTORY "$Avg_Frame_Time,$Avg_Frame_Time_Percentage,$Avg_Style_Time,$Avg_Style_Time_Percentage,$Avg_Reflow_Time,$Avg_Reflow_Time_Percentage,");
print(HISTORY "$Avg_TotalLayout_Time,$Avg_TotalLayout_Time_Percentage,$Avg_TotalPageLoad_Time\n");
close(HISTORY);
