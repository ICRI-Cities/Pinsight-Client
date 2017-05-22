#!/bin/python
#Script for sofy shut down

import RPi.GPIO as GPIO
import time
import os

#Setup pin, enable internal pull-up
shutdown_pin = 20
GPIO.setmode(GPIO.BCM)
GPIO.setup(shutdown_pin, GPIO.IN, GPIO.PUD_UP)


# Shut down function
def Shutdown(channel):
	os.system("sudo shutdown -h now")

#Setup interrupt to trigger shutdown
GPIO.add_event_detect(shutdown_pin, GPIO.FALLING, callback= Shutdown, bouncetime = 2000)
 
while 1:
	time.sleep(1)
