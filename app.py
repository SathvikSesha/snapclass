from src.Screens.Student_Screen import student_Screen
from src.Screens.teacher_Screen import teacher_Screen
from src.Screens.home_Screen import home_screen
import streamlit as st

def main():
    if 'login_type' not in st.session_state:
        st.session_state['login_type'] = None
    match st.session_state['login_type']:
        case 'teacher':
            teacher_Screen()
        case 'student':
            student_Screen()
        case None:
           home_screen()

main()